// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {LummyEscrow} from "../src/LummyEscrow.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {EscrowBase} from "./utils/EscrowBase.sol";
import {HookToken, Reenterer} from "./utils/HookToken.sol";

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
        escrow.markHandover(ID);
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
        vm.warp(vm.getBlockTimestamp() + WINDOW + 1);
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
    // Window sengketa (keputusan B dan D)
    // ================================================================

    function test_window_releaseRevertsAtDeadline() public {
        _inWindow();
        vm.warp(vm.getBlockTimestamp() + WINDOW);
        vm.expectRevert(LummyEscrow.WindowNotElapsed.selector);
        escrow.release(ID);
    }

    function test_window_disputeAllowedAtDeadline() public {
        _inWindow();
        vm.warp(vm.getBlockTimestamp() + WINDOW);
        _dispute();
        assertTrue(_listing(ID).disputed);
    }

    function test_window_disputeClosedOneSecondLater() public {
        _inWindow();
        vm.warp(vm.getBlockTimestamp() + WINDOW + 1);
        vm.prank(buyer);
        vm.expectRevert(LummyEscrow.WindowClosed.selector);
        escrow.raiseDispute(ID);
    }

    function test_release_blockedWhileDisputed() public {
        _inWindow();
        _dispute();
        vm.warp(vm.getBlockTimestamp() + WINDOW + 30 days);
        vm.expectRevert(LummyEscrow.IsDisputed.selector);
        escrow.release(ID);
    }

    function test_dispute_beforeHandoverStillBlocksRelease() public {
        _funded();
        _dispute();
        vm.prank(seller);
        escrow.markHandover(ID);
        vm.warp(vm.getBlockTimestamp() + WINDOW + 1);
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

    // ================================================================
    // Komitmen barcode (keputusan A)
    // ================================================================

    function test_commit_duplicateRejected() public {
        _list(ID, PRICE, COMMIT);
        vm.prank(stranger);
        vm.expectRevert(LummyEscrow.CommitAlreadyUsed.selector);
        escrow.createListing(ID2, PRICE, COMMIT);
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
        vm.prank(seller);
        vm.expectRevert(LummyEscrow.CommitAlreadyUsed.selector);
        escrow.createListing(ID2, PRICE, COMMIT);
    }

    function test_commit_zeroRejected() public {
        vm.prank(seller);
        vm.expectRevert(LummyEscrow.ZeroCommit.selector);
        escrow.createListing(ID, PRICE, bytes32(0));
    }

    function test_listing_idCannotBeReused() public {
        _list(ID, PRICE, COMMIT);
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(LummyEscrow.BadStatus.selector, LummyEscrow.Status.Listed));
        escrow.createListing(ID, PRICE, COMMIT2);
    }

    // ================================================================
    // Harga
    // ================================================================

    function test_price_zeroRejected() public {
        vm.prank(seller);
        vm.expectRevert(LummyEscrow.PriceZeroOrAboveCap.selector);
        escrow.createListing(ID, 0, COMMIT);
    }

    function test_price_aboveCapRejected() public {
        vm.prank(seller);
        vm.expectRevert(LummyEscrow.PriceZeroOrAboveCap.selector);
        escrow.createListing(ID, CAP + 1, COMMIT);
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

    function test_resolve_aboveePriceReverts() public {
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

    function test_access_onlySellerCancels() public {
        _list(ID, PRICE, COMMIT);
        vm.prank(stranger);
        vm.expectRevert(LummyEscrow.NotSeller.selector);
        escrow.cancelListing(ID);
    }

    function test_access_onlySellerMarksHandover() public {
        _funded();
        vm.prank(stranger);
        vm.expectRevert(LummyEscrow.NotSeller.selector);
        escrow.markHandover(ID);
    }

    function test_access_onlyBuyerDisputes() public {
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
        HookToken token = new HookToken();
        LummyEscrow e = new LummyEscrow(token, admin, operator, CAP, WINDOW);
        Reenterer attacker = new Reenterer();
        attacker.setEscrow(e);
        token.mint(buyer, PRICE);

        attacker.list(ID, PRICE, COMMIT);
        _submit(e, ID, _signFund(e, token, ID, PRICE, buyerKey, "n"));
        attacker.handover(ID);
        vm.warp(vm.getBlockTimestamp() + WINDOW + 1);
        e.release(ID);

        token.setHookTarget(address(attacker));
        vm.expectRevert(ReentrancyGuardTransient.ReentrancyGuardReentrantCall.selector);
        attacker.withdraw();
        assertEq(e.pending(address(attacker)), PRICE);
        assertEq(token.balanceOf(address(e)), PRICE);
    }
}
