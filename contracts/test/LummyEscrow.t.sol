// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {LummyEscrow} from "../src/LummyEscrow.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {EscrowBase} from "./utils/EscrowBase.sol";
import {FundHookToken, HookToken, Reenterer, ShortToken} from "./utils/HookToken.sol";

contract LummyEscrowTest is EscrowBase {
    bytes32 internal constant ID = keccak256("listing-1");
    bytes32 internal constant ID2 = keccak256("listing-2");
    bytes32 internal constant COMMIT = keccak256("barcode-1");
    bytes32 internal constant COMMIT2 = keccak256("barcode-2");

    function _funded() internal {
        _list(ID, PRICE, COMMIT);
        _fund(ID, PRICE);
    }

    function _inWindow() internal {
        _funded();
        vm.prank(seller);
        escrow.markHandover(ID, HANDOVER);
    }

    function _dispute() internal {
        vm.prank(buyer);
        escrow.raiseDispute(ID);
    }

    function _unauthorized(address who, bytes32 role) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, who, role);
    }

    // ================================================================
    // Enam jalur outcome, sama dengan tabel metrik Demo Day
    // ================================================================

    /// 1. Masuk lancar: window lewat tanpa sengketa, orang asing pun bisa mencairkan ke seller.
    function test_path1_cleanEntry_autoRelease() public {
        _inWindow();
        vm.warp(_deadline(ID) + 1);
        vm.prank(stranger);
        escrow.release(ID);
        _assertStatus(ID, LummyEscrow.Status.Released);
        _withdrawAndCheck(seller, PRICE);
    }

    /// 2. Ditolak di gate karena QR sudah dipindai: sengketa, putusan refund penuh.
    function test_path2_refusedAtGate_fullRefund() public {
        _inWindow();
        _dispute();
        vm.prank(operator);
        escrow.resolveDispute(ID, PRICE);
        _assertStatus(ID, LummyEscrow.Status.Refunded);
        _withdrawAndCheck(buyer, PRICE);
        assertEq(escrow.pending(seller), 0);
    }

    /// 3. Seller tidak pernah menyerahkan tiket, klaim sebelum acara: refund penuh.
    function test_path3_neverDelivered_refundBeforeEvent() public {
        _funded();
        vm.prank(operator);
        escrow.refund(ID);
        _assertStatus(ID, LummyEscrow.Status.Refunded);
        _withdrawAndCheck(buyer, PRICE);
    }

    /// 4. Tier yang diterima lebih rendah: pembeli dapat selisihnya, seller sisanya (keputusan C).
    function test_path4_wrongTier_partialRefund() public {
        _inWindow();
        _dispute();
        uint256 back = PRICE / 2;
        vm.expectEmit(address(escrow));
        emit LummyEscrow.Resolved(ID, back, PRICE - back);
        vm.prank(operator);
        escrow.resolveDispute(ID, back);
        _assertStatus(ID, LummyEscrow.Status.Refunded);
        _withdrawAndCheck(buyer, back);
        _withdrawAndCheck(seller, PRICE - back);
    }

    /// 5. Organizer membatalkan acara: refund penuh. Di chain transisinya sama dengan jalur 3,
    /// bedanya ada di luar kontrak (seller tidak dipenalti).
    function test_path5_organizerCancels_refund() public {
        _funded();
        vm.prank(operator);
        escrow.refund(ID);
        _withdrawAndCheck(buyer, PRICE);
        assertEq(escrow.pending(seller), 0);
    }

    /// 6. Pembeli tidak datang lalu mengajukan klaim: bukan kasus refund, putusan 0 untuk pembeli.
    function test_path6_buyerNoShow_releasedToSeller() public {
        _inWindow();
        _dispute();
        vm.prank(operator);
        escrow.resolveDispute(ID, 0);
        _assertStatus(ID, LummyEscrow.Status.Released);
        _withdrawAndCheck(seller, PRICE);
        assertEq(escrow.pending(buyer), 0);
    }

    // ================================================================
    // Model A: operator bertindak atas nama pengguna (keputusan F)
    // ================================================================

    /// Satu siklus penuh di mana seller dan pembeli tidak pernah mengirim transaksi sendiri.
    /// Pembeli cuma menandatangani, jadi yang butuh ETH untuk gas cuma operator.
    function test_modelA_operatorDrivesWholeCycle() public {
        vm.startPrank(operator);
        escrow.createListingFor(seller, ID, PRICE, COMMIT, _now40());
        _submit(escrow, ID, _signFund(escrow, usdc, ID, PRICE, buyerKey, "n"));
        escrow.markHandover(ID, HANDOVER);
        vm.warp(_deadline(ID) + 1);
        escrow.release(ID);
        escrow.withdrawFor(seller);
        vm.stopPrank();

        assertEq(_listing(ID).seller, seller);
        assertEq(usdc.balanceOf(seller), PRICE);
        assertEq(escrow.pending(operator), 0);
    }

    function test_modelA_operatorRaisesDisputeForBuyer() public {
        _inWindow();
        vm.prank(operator);
        escrow.raiseDispute(ID);
        assertTrue(_listing(ID).disputed);
    }

    function test_modelA_operatorCancelsForSeller() public {
        _list(ID, PRICE, COMMIT);
        vm.prank(operator);
        escrow.cancelListing(ID);
        _assertStatus(ID, LummyEscrow.Status.Cancelled);
        assertFalse(escrow.commitUsed(COMMIT));
    }

    function test_modelA_createListingForIsOperatorOnly() public {
        bytes32 role = escrow.OPERATOR_ROLE();
        vm.prank(stranger);
        vm.expectRevert(_unauthorized(stranger, role));
        escrow.createListingFor(stranger, ID, PRICE, COMMIT, _now40());
    }

    function test_modelA_createListingForRejectsZeroSeller() public {
        vm.prank(operator);
        vm.expectRevert(LummyEscrow.ZeroAddress.selector);
        escrow.createListingFor(address(0), ID, PRICE, COMMIT, _now40());
    }

    /// Operator tidak bisa mengajukan sengketa untuk listing yang belum punya pembeli.
    function test_modelA_noDisputeBeforeFunding() public {
        _list(ID, PRICE, COMMIT);
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(LummyEscrow.BadStatus.selector, LummyEscrow.Status.Listed));
        escrow.raiseDispute(ID);
    }

    /// Siapa pun boleh mengirim alokasi ke pemiliknya, dan dananya tidak bisa ke tempat lain.
    function test_withdrawFor_anyonePushesToPayee() public {
        test_path4_wrongTier_partialRefund_pendingOnly();
        uint256 sellerBefore = usdc.balanceOf(seller);
        vm.prank(stranger);
        escrow.withdrawFor(seller);
        assertEq(usdc.balanceOf(seller) - sellerBefore, PRICE / 2);
        assertEq(usdc.balanceOf(stranger), 0);
        assertEq(escrow.pending(seller), 0);
    }

    function test_withdrawFor_nothingToWithdraw() public {
        vm.prank(stranger);
        vm.expectRevert(LummyEscrow.NothingToWithdraw.selector);
        escrow.withdrawFor(seller);
    }

    /// Jalur 4 tanpa penarikan: dua pihak punya alokasi yang belum ditarik.
    function test_path4_wrongTier_partialRefund_pendingOnly() public {
        _inWindow();
        _dispute();
        vm.prank(operator);
        escrow.resolveDispute(ID, PRICE / 2);
        assertEq(escrow.pending(buyer), PRICE / 2);
        assertEq(escrow.pending(seller), PRICE - PRICE / 2);
    }

    // ================================================================
    // Dana menunggu acara selesai (keputusan G)
    // ================================================================

    /// Serah terima sebelum acara tidak memulai hitung mundur: window baru dihitung dari acara selesai.
    function test_eventEnd_releaseWaitsForEvent() public {
        uint40 eventEnd = _now40() + 30 days;
        _listWithEvent(ID, PRICE, COMMIT, eventEnd);
        _fund(ID, PRICE);
        vm.prank(seller);
        escrow.markHandover(ID, HANDOVER);

        vm.warp(vm.getBlockTimestamp() + WINDOW + 1);
        vm.expectRevert(LummyEscrow.WindowNotElapsed.selector);
        escrow.release(ID);

        vm.warp(uint256(eventEnd) + WINDOW);
        vm.expectRevert(LummyEscrow.WindowNotElapsed.selector);
        escrow.release(ID);

        vm.warp(uint256(eventEnd) + WINDOW + 1);
        escrow.release(ID);
        _assertStatus(ID, LummyEscrow.Status.Released);
    }

    function test_eventEnd_disputeOpenUntilEventPlusWindow() public {
        uint40 eventEnd = _now40() + 30 days;
        _listWithEvent(ID, PRICE, COMMIT, eventEnd);
        _fund(ID, PRICE);
        vm.prank(seller);
        escrow.markHandover(ID, HANDOVER);

        vm.warp(uint256(eventEnd) + WINDOW + 1);
        vm.prank(buyer);
        vm.expectRevert(LummyEscrow.WindowClosed.selector);
        escrow.raiseDispute(ID);

        vm.warp(uint256(eventEnd) + WINDOW);
        _dispute();
        assertTrue(_listing(ID).disputed);
    }

    function test_eventEnd_zeroRejected() public {
        vm.prank(seller);
        vm.expectRevert(LummyEscrow.NoEventEnd.selector);
        escrow.createListing(ID, PRICE, COMMIT, 0);
    }

    function test_eventEnd_storedAndEmitted() public {
        uint40 eventEnd = _now40() + 7 days;
        vm.expectEmit(address(escrow));
        emit LummyEscrow.Listed(ID, seller, PRICE, COMMIT, eventEnd);
        _listWithEvent(ID, PRICE, COMMIT, eventEnd);
        assertEq(_listing(ID).eventEndsAt, eventEnd);
    }

    /// Acara diundur: pencairan ikut mundur. Tanpa ini dana cair 48 jam setelah tanggal lama.
    function test_postpone_movesDeadlineLater() public {
        uint40 eventEnd = _now40() + 10 days;
        _listWithEvent(ID, PRICE, COMMIT, eventEnd);
        _fund(ID, PRICE);
        vm.prank(seller);
        escrow.markHandover(ID, HANDOVER);

        uint40 newEnd = eventEnd + 14 days;
        vm.prank(operator);
        escrow.postponeEvent(ID, newEnd);

        vm.warp(uint256(eventEnd) + WINDOW + 1);
        vm.expectRevert(LummyEscrow.WindowNotElapsed.selector);
        escrow.release(ID);

        vm.warp(uint256(newEnd) + WINDOW + 1);
        escrow.release(ID);
        _assertStatus(ID, LummyEscrow.Status.Released);
    }

    /// Kunci operator yang bocor tidak bisa mempercepat pencairan.
    function test_postpone_cannotMoveEarlier() public {
        uint40 eventEnd = _now40() + 10 days;
        _listWithEvent(ID, PRICE, COMMIT, eventEnd);
        vm.startPrank(operator);
        vm.expectRevert(LummyEscrow.CannotMoveEventEarlier.selector);
        escrow.postponeEvent(ID, eventEnd - 1);
        vm.expectRevert(LummyEscrow.CannotMoveEventEarlier.selector);
        escrow.postponeEvent(ID, eventEnd);
        vm.stopPrank();
    }

    function test_postpone_operatorOnly() public {
        _list(ID, PRICE, COMMIT);
        bytes32 role = escrow.OPERATOR_ROLE();
        vm.prank(seller);
        vm.expectRevert(_unauthorized(seller, role));
        escrow.postponeEvent(ID, _now40() + 1 days);
    }

    function test_postpone_notAfterSettlement() public {
        test_path3_neverDelivered_refundBeforeEvent();
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(LummyEscrow.BadStatus.selector, LummyEscrow.Status.Refunded));
        escrow.postponeEvent(ID, _now40() + 1 days);
    }

    /// Acara diundur selagi window buka: pembeli masih bisa mengajukan sengketa setelah batas yang lama.
    function test_postpone_disputeStaysOpenPastOldDeadline() public {
        uint40 eventEnd = _now40() + 10 days;
        _listWithEvent(ID, PRICE, COMMIT, eventEnd);
        _fund(ID, PRICE);
        vm.prank(seller);
        escrow.markHandover(ID, HANDOVER);
        vm.prank(operator);
        escrow.postponeEvent(ID, eventEnd + 14 days);

        vm.warp(uint256(eventEnd) + WINDOW + 1);
        _dispute();
        assertTrue(_listing(ID).disputed);
    }

    // ================================================================
    // Setelah window lewat tanpa sengketa, dana hak seller (keputusan G)
    // ================================================================

    /// Operator tidak bisa mendahului `release` dengan refund begitu window tutup.
    function test_afterWindow_refundClosed() public {
        _inWindow();
        vm.warp(_deadline(ID) + 1);
        vm.prank(operator);
        vm.expectRevert(LummyEscrow.WindowClosed.selector);
        escrow.refund(ID);

        escrow.release(ID);
        _assertStatus(ID, LummyEscrow.Status.Released);
    }

    function test_afterWindow_refundStillAllowedAtDeadline() public {
        _inWindow();
        vm.warp(_deadline(ID));
        vm.prank(operator);
        escrow.refund(ID);
        _assertStatus(ID, LummyEscrow.Status.Refunded);
    }

    /// Jadwal tidak bisa dimundurkan untuk membuka lagi window yang sudah tutup.
    function test_afterWindow_postponeClosed() public {
        _inWindow();
        vm.warp(_deadline(ID) + 1);
        vm.prank(operator);
        vm.expectRevert(LummyEscrow.WindowClosed.selector);
        escrow.postponeEvent(ID, _now40() + 30 days);
    }

    /// Sengketa yang diajukan tepat waktu tetap bisa diselesaikan kapan pun, termasuk dengan refund penuh.
    function test_afterWindow_disputedStillSettledByOperator() public {
        _inWindow();
        _dispute();
        vm.warp(_deadline(ID) + 30 days);
        vm.prank(operator);
        escrow.refund(ID);
        _assertStatus(ID, LummyEscrow.Status.Refunded);
    }

    /// Tanpa serah terima dana tidak pernah bisa cair ke seller, jadi refund tidak punya batas waktu.
    function test_refund_withoutHandoverHasNoDeadline() public {
        _funded();
        vm.warp(_deadline(ID) + 365 days);
        vm.prank(operator);
        escrow.refund(ID);
        _withdrawAndCheck(buyer, PRICE);
    }

    // ================================================================
    // Bukti serah terima (keputusan H)
    // ================================================================

    function test_handover_emitsProofHash() public {
        _funded();
        vm.expectEmit(address(escrow));
        emit LummyEscrow.HandoverMarked(ID, HANDOVER, vm.getBlockTimestamp() + WINDOW);
        vm.prank(seller);
        escrow.markHandover(ID, HANDOVER);
    }

    function test_handover_zeroProofRejected() public {
        _funded();
        vm.prank(seller);
        vm.expectRevert(LummyEscrow.NoHandoverProof.selector);
        escrow.markHandover(ID, bytes32(0));
    }

    // ================================================================
    // Window sengketa (keputusan B dan D)
    // ================================================================

    function test_window_releaseRevertsAtDeadline() public {
        _inWindow();
        vm.warp(_deadline(ID));
        vm.expectRevert(LummyEscrow.WindowNotElapsed.selector);
        escrow.release(ID);
    }

    function test_window_disputeAllowedAtDeadline() public {
        _inWindow();
        vm.warp(_deadline(ID));
        _dispute();
        assertTrue(_listing(ID).disputed);
    }

    function test_window_disputeClosedOneSecondLater() public {
        _inWindow();
        vm.warp(_deadline(ID) + 1);
        vm.prank(buyer);
        vm.expectRevert(LummyEscrow.WindowClosed.selector);
        escrow.raiseDispute(ID);
    }

    function test_release_blockedWhileDisputed() public {
        _inWindow();
        _dispute();
        vm.warp(_deadline(ID) + 30 days);
        vm.expectRevert(LummyEscrow.IsDisputed.selector);
        escrow.release(ID);
    }

    function test_dispute_beforeHandoverStillBlocksRelease() public {
        _funded();
        _dispute();
        vm.prank(seller);
        escrow.markHandover(ID, HANDOVER);
        vm.warp(_deadline(ID) + 1);
        vm.expectRevert(LummyEscrow.IsDisputed.selector);
        escrow.release(ID);
    }

    function test_dispute_twiceRejected() public {
        _inWindow();
        _dispute();
        vm.prank(buyer);
        vm.expectRevert(LummyEscrow.AlreadyDisputed.selector);
        escrow.raiseDispute(ID);
    }

    function test_window_readableFromChain() public view {
        assertEq(escrow.disputeWindow(), WINDOW);
    }

    function test_window_constructorRejectsBelowFloor() public {
        vm.expectRevert(LummyEscrow.WindowTooShort.selector);
        new LummyEscrow(usdc, admin, operator, CAP, 4 minutes);
    }

    function test_window_demoValueAccepted() public {
        LummyEscrow demo = new LummyEscrow(usdc, admin, operator, CAP, 10 minutes);
        assertEq(demo.disputeWindow(), 10 minutes);
    }

    function test_constructor_rejectsZeroAddresses() public {
        vm.expectRevert(LummyEscrow.ZeroAddress.selector);
        new LummyEscrow(MockUSDC(address(0)), admin, operator, CAP, WINDOW);
        vm.expectRevert(LummyEscrow.ZeroAddress.selector);
        new LummyEscrow(usdc, address(0), operator, CAP, WINDOW);
        vm.expectRevert(LummyEscrow.ZeroAddress.selector);
        new LummyEscrow(usdc, admin, address(0), CAP, WINDOW);
    }

    // ================================================================
    // Komitmen barcode (keputusan A)
    // ================================================================

    function test_commit_duplicateRejected() public {
        _list(ID, PRICE, COMMIT);
        uint40 ev = _now40();
        vm.prank(stranger);
        vm.expectRevert(LummyEscrow.CommitAlreadyUsed.selector);
        escrow.createListing(ID2, PRICE, COMMIT, ev);
    }

    /// Operator pun tidak bisa memakai komitmen yang sama untuk listing lain.
    function test_commit_duplicateRejectedForOperatorToo() public {
        _list(ID, PRICE, COMMIT);
        uint40 ev = _now40();
        vm.prank(operator);
        vm.expectRevert(LummyEscrow.CommitAlreadyUsed.selector);
        escrow.createListingFor(stranger, ID2, PRICE, COMMIT, ev);
    }

    function test_commit_freedByCancel() public {
        _list(ID, PRICE, COMMIT);
        vm.prank(seller);
        escrow.cancelListing(ID);
        assertFalse(escrow.commitUsed(COMMIT));
        _list(ID2, PRICE + 1, COMMIT);
        _assertStatus(ID2, LummyEscrow.Status.Listed);
    }

    function test_commit_staysUsedAfterRefund() public {
        _funded();
        vm.prank(operator);
        escrow.refund(ID);
        assertTrue(escrow.commitUsed(COMMIT));
        uint40 ev = _now40();
        vm.prank(seller);
        vm.expectRevert(LummyEscrow.CommitAlreadyUsed.selector);
        escrow.createListing(ID2, PRICE, COMMIT, ev);
    }

    function test_commit_zeroRejected() public {
        uint40 ev = _now40();
        vm.prank(seller);
        vm.expectRevert(LummyEscrow.ZeroCommit.selector);
        escrow.createListing(ID, PRICE, bytes32(0), ev);
    }

    function test_listing_idCannotBeReused() public {
        _list(ID, PRICE, COMMIT);
        uint40 ev = _now40();
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(LummyEscrow.BadStatus.selector, LummyEscrow.Status.Listed));
        escrow.createListing(ID, PRICE, COMMIT2, ev);
    }

    // ================================================================
    // Harga
    // ================================================================

    function test_price_zeroRejected() public {
        uint40 ev = _now40();
        vm.prank(seller);
        vm.expectRevert(LummyEscrow.PriceZeroOrAboveCap.selector);
        escrow.createListing(ID, 0, COMMIT, ev);
    }

    function test_price_aboveCapRejected() public {
        uint40 ev = _now40();
        vm.prank(seller);
        vm.expectRevert(LummyEscrow.PriceZeroOrAboveCap.selector);
        escrow.createListing(ID, CAP + 1, COMMIT, ev);
    }

    function test_price_capLoweredBlocksNewFunding() public {
        _list(ID, PRICE, COMMIT);
        vm.prank(admin);
        escrow.setPriceCap(PRICE - 1);
        FundArgs memory a = _signFund(escrow, usdc, ID, PRICE, buyerKey, "n");
        vm.expectRevert(LummyEscrow.PriceZeroOrAboveCap.selector);
        _submit(escrow, ID, a);
    }

    function test_price_capAboveUint128Rejected() public {
        vm.prank(admin);
        vm.expectRevert(LummyEscrow.PriceZeroOrAboveCap.selector);
        escrow.setPriceCap(uint256(type(uint128).max) + 1);
    }

    // ================================================================
    // Putusan (keputusan C)
    // ================================================================

    function test_resolve_abovePriceReverts() public {
        _inWindow();
        _dispute();
        vm.prank(operator);
        vm.expectRevert(LummyEscrow.AmountAbovePrice.selector);
        escrow.resolveDispute(ID, PRICE + 1);
    }

    function test_resolve_requiresDispute() public {
        _inWindow();
        vm.prank(operator);
        vm.expectRevert(LummyEscrow.NotDisputed.selector);
        escrow.resolveDispute(ID, 1);
    }

    /// Putusan cuma sekali: putusan kedua ditolak, jadi alokasi tidak bisa berlipat.
    function test_resolve_onlyOnce() public {
        _inWindow();
        _dispute();
        vm.startPrank(operator);
        escrow.resolveDispute(ID, PRICE / 2);
        vm.expectRevert(abi.encodeWithSelector(LummyEscrow.BadStatus.selector, LummyEscrow.Status.Refunded));
        escrow.resolveDispute(ID, PRICE / 2);
        vm.stopPrank();
        assertEq(escrow.pending(buyer), PRICE / 2);
        assertEq(escrow.pending(buyer) + escrow.pending(seller), PRICE);
    }

    function testFuzz_resolve_splitAlwaysSumsToPrice(uint256 toBuyer) public {
        toBuyer = bound(toBuyer, 0, PRICE);
        _inWindow();
        _dispute();
        vm.prank(operator);
        escrow.resolveDispute(ID, toBuyer);
        assertEq(escrow.pending(buyer), toBuyer);
        assertEq(escrow.pending(buyer) + escrow.pending(seller), PRICE);
    }

    // ================================================================
    // Hak akses
    // ================================================================

    function test_access_onlyOperatorRefunds() public {
        _funded();
        bytes32 role = escrow.OPERATOR_ROLE();
        vm.prank(stranger);
        vm.expectRevert(_unauthorized(stranger, role));
        escrow.refund(ID);
    }

    function test_access_onlyOperatorResolves() public {
        _inWindow();
        _dispute();
        bytes32 role = escrow.OPERATOR_ROLE();
        vm.prank(stranger);
        vm.expectRevert(_unauthorized(stranger, role));
        escrow.resolveDispute(ID, PRICE);
    }

    /// Admin (Safe) mengatur peran dan plafon, tapi tidak bisa menyentuh dana.
    function test_access_adminCannotMoveFunds() public {
        _inWindow();
        _dispute();
        bytes32 role = escrow.OPERATOR_ROLE();
        vm.startPrank(admin);
        vm.expectRevert(_unauthorized(admin, role));
        escrow.refund(ID);
        vm.expectRevert(_unauthorized(admin, role));
        escrow.resolveDispute(ID, PRICE);
        vm.stopPrank();
    }

    function test_access_onlyAdminSetsCap() public {
        bytes32 role = escrow.DEFAULT_ADMIN_ROLE();
        vm.prank(operator);
        vm.expectRevert(_unauthorized(operator, role));
        escrow.setPriceCap(1);
    }

    function test_access_onlySellerOrOperatorCancels() public {
        _list(ID, PRICE, COMMIT);
        vm.prank(stranger);
        vm.expectRevert(LummyEscrow.NotSeller.selector);
        escrow.cancelListing(ID);
    }

    function test_access_onlySellerOrOperatorMarksHandover() public {
        _funded();
        vm.prank(stranger);
        vm.expectRevert(LummyEscrow.NotSeller.selector);
        escrow.markHandover(ID, HANDOVER);
    }

    function test_access_onlyBuyerOrOperatorDisputes() public {
        _inWindow();
        vm.prank(seller);
        vm.expectRevert(LummyEscrow.NotBuyer.selector);
        escrow.raiseDispute(ID);
    }

    // ================================================================
    // Pendanaan dan tanda tangan
    // ================================================================

    function test_fund_locksExactPrice() public {
        uint256 before = usdc.balanceOf(buyer);
        _funded();
        LummyEscrow.Listing memory L = _listing(ID);
        assertEq(usdc.balanceOf(address(escrow)), PRICE);
        assertEq(before - usdc.balanceOf(buyer), PRICE);
        assertEq(L.buyer, buyer);
        assertEq(uint8(L.status), uint8(LummyEscrow.Status.Funded));
    }

    /// Relayer bebas: yang mengikat adalah tanda tangan pembeli, bukan siapa pengirimnya.
    function test_fund_byAnyRelayer() public {
        _list(ID, PRICE, COMMIT);
        FundArgs memory a = _signFund(escrow, usdc, ID, PRICE, buyerKey, "n");
        vm.prank(stranger);
        _submit(escrow, ID, a);
        _assertStatus(ID, LummyEscrow.Status.Funded);
    }

    /// Otorisasi dan niat untuk listing A tidak bisa dipakai mendanai listing B yang harganya sama.
    function test_fund_intentBoundToListing() public {
        _list(ID, PRICE, COMMIT);
        _list(ID2, PRICE, COMMIT2);
        FundArgs memory a = _signFund(escrow, usdc, ID, PRICE, buyerKey, "n");
        vm.expectRevert(LummyEscrow.BadSignature.selector);
        _submit(escrow, ID2, a);
    }

    /// Otorisasi ERC-3009 sekali pakai: niat baru untuk listing lain dengan nonce yang sama ditolak token.
    function test_fund_authorizationReplayRejected() public {
        _list(ID, PRICE, COMMIT);
        _list(ID2, PRICE, COMMIT2);
        _submit(escrow, ID, _signFund(escrow, usdc, ID, PRICE, buyerKey, "n"));
        FundArgs memory b = _signFund(escrow, usdc, ID2, PRICE, buyerKey, "n");
        vm.expectRevert(MockUSDC.AuthUsed.selector);
        _submit(escrow, ID2, b);
    }

    function test_fund_expiredDeadlineRejected() public {
        _list(ID, PRICE, COMMIT);
        FundArgs memory a = _signFund(escrow, usdc, ID, PRICE, buyerKey, "n");
        vm.warp(a.deadline + 1);
        vm.expectRevert(LummyEscrow.ExpiredDeadline.selector);
        _submit(escrow, ID, a);
    }

    function test_fund_wrongValueRejected() public {
        _list(ID, PRICE, COMMIT);
        FundArgs memory a = _signFund(escrow, usdc, ID, PRICE - 1, buyerKey, "n");
        vm.expectRevert(LummyEscrow.PriceZeroOrAboveCap.selector);
        _submit(escrow, ID, a);
    }

    function test_fund_twiceRejected() public {
        _funded();
        FundArgs memory a = _signFund(escrow, usdc, ID, PRICE, buyerKey, "n2");
        vm.expectRevert(abi.encodeWithSelector(LummyEscrow.BadStatus.selector, LummyEscrow.Status.Funded));
        _submit(escrow, ID, a);
    }

    /// Dua checkout pembeli yang sama boleh dikirim dalam urutan apa pun (nonce acak, bukan berurutan).
    function test_fund_concurrentCheckoutsAnyOrder() public {
        _list(ID, PRICE, COMMIT);
        _list(ID2, PRICE, COMMIT2);
        FundArgs memory first = _signFund(escrow, usdc, ID, PRICE, buyerKey, "first");
        FundArgs memory second = _signFund(escrow, usdc, ID2, PRICE, buyerKey, "second");
        _submit(escrow, ID2, second);
        _submit(escrow, ID, first);
        _assertStatus(ID, LummyEscrow.Status.Funded);
        _assertStatus(ID2, LummyEscrow.Status.Funded);
    }

    /// Token yang menyerahkan kurang dari harga ditolak, dan listing tetap terbuka tanpa pembeli.
    function test_fund_shortDeliveryRejected() public {
        ShortToken token = new ShortToken();
        LummyEscrow e = new LummyEscrow(token, admin, operator, CAP, WINDOW);
        token.mint(buyer, PRICE);
        vm.prank(seller);
        e.createListing(ID, PRICE, COMMIT, _now40());
        FundArgs memory a = _signFund(e, token, ID, PRICE, buyerKey, "n");

        vm.expectRevert(LummyEscrow.TransferMismatch.selector);
        _submit(e, ID, a);
        (, address listingBuyer,,,, LummyEscrow.Status status,,) = e.listings(ID);
        assertEq(uint8(status), uint8(LummyEscrow.Status.Listed));
        assertEq(listingBuyer, address(0));
        assertEq(token.balanceOf(buyer), PRICE);
    }

    // ================================================================
    // Penarikan
    // ================================================================

    function test_withdraw_nothingToWithdraw() public {
        vm.prank(stranger);
        vm.expectRevert(LummyEscrow.NothingToWithdraw.selector);
        escrow.withdraw();
    }

    function test_withdraw_cannotDoubleWithdraw() public {
        test_path1_cleanEntry_autoRelease();
        vm.prank(seller);
        vm.expectRevert(LummyEscrow.NothingToWithdraw.selector);
        escrow.withdraw();
    }

    /// Token jahat memanggil `withdraw` lagi di tengah transfer: guard menolak, alokasi tetap utuh.
    function test_reentrancy_withdrawGuarded() public {
        (HookToken token, LummyEscrow e, Reenterer attacker) = _attackerWithPayout();
        vm.expectRevert(ReentrancyGuardTransient.ReentrancyGuardReentrantCall.selector);
        attacker.withdraw();
        assertEq(e.pending(address(attacker)), PRICE);
        assertEq(token.balanceOf(address(e)), PRICE);
    }

    /// Sama lewat `withdrawFor`: pemicu dari luar tidak membuka jalan reentrancy.
    function test_reentrancy_withdrawForGuarded() public {
        (HookToken token, LummyEscrow e, Reenterer attacker) = _attackerWithPayout();
        vm.prank(stranger);
        vm.expectRevert(ReentrancyGuardTransient.ReentrancyGuardReentrantCall.selector);
        e.withdrawFor(address(attacker));
        assertEq(e.pending(address(attacker)), PRICE);
        assertEq(token.balanceOf(address(e)), PRICE);
    }

    /// Token jahat memanggil `fund` listing lain di tengah penarikan dana pembeli. Guard menolak, jadi saldo
    /// escrow tidak bisa bertambah lewat jalur lain di antara dua pembacaan `balanceOf` di `_pull` (temuan
    /// Slither reentrancy-balance, lihat SECURITY-ANALYSIS.md).
    function test_reentrancy_fundGuarded() public {
        FundHookToken token = new FundHookToken();
        LummyEscrow e = new LummyEscrow(token, admin, operator, CAP, WINDOW);
        token.mint(buyer, 2 * PRICE);
        vm.startPrank(seller);
        e.createListing(ID, PRICE, COMMIT, _now40());
        e.createListing(ID2, PRICE, COMMIT2, _now40());
        vm.stopPrank();

        FundArgs memory inner = _signFund(e, token, ID2, PRICE, buyerKey, "inner");
        token.arm(
            address(e),
            abi.encodeCall(
                e.fund,
                (
                    ID2,
                    inner.from,
                    inner.value,
                    inner.validAfter,
                    inner.validBefore,
                    inner.authNonce,
                    inner.authSig,
                    inner.deadline,
                    inner.fundSig
                )
            )
        );
        FundArgs memory outer = _signFund(e, token, ID, PRICE, buyerKey, "outer");

        vm.expectRevert(ReentrancyGuardTransient.ReentrancyGuardReentrantCall.selector);
        _submit(e, ID, outer);
        assertEq(token.balanceOf(address(e)), 0);
        assertEq(token.balanceOf(buyer), 2 * PRICE);
    }

    /// Seller jahat yang sudah punya alokasi, dengan token yang memanggilnya balik saat menerima dana.
    function _attackerWithPayout() internal returns (HookToken token, LummyEscrow e, Reenterer attacker) {
        token = new HookToken();
        e = new LummyEscrow(token, admin, operator, CAP, WINDOW);
        attacker = new Reenterer();
        attacker.setEscrow(e);
        token.mint(buyer, PRICE);

        attacker.list(ID, PRICE, COMMIT, _now40());
        _submit(e, ID, _signFund(e, token, ID, PRICE, buyerKey, "n"));
        attacker.handover(ID, HANDOVER);
        vm.warp(vm.getBlockTimestamp() + WINDOW + 1);
        e.release(ID);
        token.setHookTarget(address(attacker));
    }
}
