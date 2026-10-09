// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {LummyLedger} from "../src/LummyLedger.sol";
import {LedgerBase} from "./utils/LedgerBase.sol";

contract LummyLedgerTest is LedgerBase {
    bytes32 internal constant ID = keccak256("lummy:order:or-000000000001");
    bytes32 internal constant ID2 = keccak256("lummy:order:or-000000000002");
    bytes32 internal constant PAY = keccak256("lummy:xendit:pr-1");
    bytes32 internal constant PAY2 = keccak256("lummy:xendit:pr-2");
    bytes32 internal constant COMMIT = keccak256("lummy:barcode:1");

    uint40 internal showEnds;

    function setUp() public override {
        super.setUp();
        showEnds = _now40() + 3 days; // acaranya tiga hari lagi
    }

    function _opened() internal {
        _open(ID, AMOUNT, PAY, COMMIT, showEnds);
    }

    function _dispute() internal {
        vm.prank(operator);
        ledger.raiseDispute(ID);
    }

    function _afterWindow() internal {
        vm.warp(uint256(showEnds) + WINDOW + 1);
    }

    function _assertStatus(bytes32 id, LummyLedger.Status s) internal view {
        assertEq(uint8(_order(id).status), uint8(s));
    }

    function _badStatus(LummyLedger.Status s) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(LummyLedger.BadStatus.selector, s);
    }

    // ================================================================
    // Jalur utama
    // ================================================================

    /// Pembayaran tercatat dengan semua buktinya, lalu cair ke penjual setelah window lewat tanpa
    /// klaim. Pencatatan pencairan boleh dipicu siapa pun.
    function test_open_thenAnyoneRecordsReleaseAfterWindow() public {
        vm.expectEmit(address(ledger));
        emit LummyLedger.Opened(ID, AMOUNT, PAY, COMMIT, HANDOVER, showEnds, uint256(showEnds) + WINDOW);
        _opened();

        LummyLedger.Order memory O = _order(ID);
        assertEq(O.amount, AMOUNT);
        assertEq(O.openedAt, _now40());
        assertEq(O.eventEndsAt, showEnds);
        assertEq(uint8(O.status), uint8(LummyLedger.Status.Open));
        assertFalse(O.disputed);
        assertTrue(ledger.paymentUsed(PAY));
        assertTrue(ledger.commitUsed(COMMIT));
        assertEq(ledger.deadlineOf(ID), uint256(showEnds) + WINDOW);

        _afterWindow();
        vm.expectEmit(address(ledger));
        emit LummyLedger.Released(ID, AMOUNT);
        vm.prank(stranger);
        ledger.release(ID);
        _assertStatus(ID, LummyLedger.Status.Released);
    }

    /// Pencairan tidak bisa dicatat sebelum window lewat, juga tepat di batasnya.
    function test_release_waitsForWindow() public {
        _opened();
        vm.expectRevert(LummyLedger.WindowNotElapsed.selector);
        ledger.release(ID);
        vm.warp(uint256(showEnds) + WINDOW);
        vm.expectRevert(LummyLedger.WindowNotElapsed.selector);
        ledger.release(ID);
        vm.warp(uint256(showEnds) + WINDOW + 1);
        ledger.release(ID);
        _assertStatus(ID, LummyLedger.Status.Released);
    }

    function test_release_blockedWhileDisputed() public {
        _opened();
        _dispute();
        _afterWindow();
        vm.expectRevert(LummyLedger.IsDisputed.selector);
        ledger.release(ID);
    }

    /// Acara dibatalkan penyelenggara: refund penuh, alasannya ikut tercatat.
    function test_refund_eventCancelled() public {
        _opened();
        vm.expectEmit(address(ledger));
        emit LummyLedger.Refunded(ID, AMOUNT, LummyLedger.RefundReason.EventCancelled);
        vm.prank(operator);
        ledger.refund(ID, LummyLedger.RefundReason.EventCancelled);
        _assertStatus(ID, LummyLedger.Status.Refunded);
    }

    /// Setelah window lewat tanpa klaim, uangnya hak penjual: refund tidak bisa dicatat lagi.
    function test_refund_closedAfterSilentWindow() public {
        _opened();
        _afterWindow();
        vm.prank(operator);
        vm.expectRevert(LummyLedger.WindowClosed.selector);
        ledger.refund(ID, LummyLedger.RefundReason.Other);
    }

    /// Selama klaim terbuka, refund tetap bisa dicatat walau window sudah lewat (mis. acara batal saat
    /// klaim masih diperiksa).
    function test_refund_whileDisputedAfterDeadline() public {
        _opened();
        _dispute();
        _afterWindow();
        vm.prank(operator);
        ledger.refund(ID, LummyLedger.RefundReason.EventCancelled);
        _assertStatus(ID, LummyLedger.Status.Refunded);
    }

    // ================================================================
    // Klaim dan putusan
    // ================================================================

    function test_dispute_openUntilDeadlineInclusive() public {
        _opened();
        vm.warp(uint256(showEnds) + WINDOW);
        vm.expectEmit(address(ledger));
        emit LummyLedger.DisputeRaised(ID);
        _dispute();
        assertTrue(_order(ID).disputed);
    }

    function test_dispute_closedAfterDeadline() public {
        _opened();
        _afterWindow();
        vm.prank(operator);
        vm.expectRevert(LummyLedger.WindowClosed.selector);
        ledger.raiseDispute(ID);
    }

    function test_dispute_once() public {
        _opened();
        _dispute();
        vm.prank(operator);
        vm.expectRevert(LummyLedger.AlreadyDisputed.selector);
        ledger.raiseDispute(ID);
    }

    /// Tier yang diterima lebih rendah: pembeli dapat selisihnya, penjual sisanya (keputusan C).
    function test_resolve_splitsBetweenBuyerAndSeller() public {
        _opened();
        _dispute();
        uint256 back = AMOUNT / 2;
        vm.expectEmit(address(ledger));
        emit LummyLedger.Resolved(ID, back, AMOUNT - back);
        vm.prank(operator);
        ledger.resolveDispute(ID, back);
        _assertStatus(ID, LummyLedger.Status.Refunded);
    }

    /// Klaim tidak terbukti: semua ke penjual, dicatat sebagai pencairan.
    function test_resolve_nothingToBuyerIsRelease() public {
        _opened();
        _dispute();
        vm.prank(operator);
        ledger.resolveDispute(ID, 0);
        _assertStatus(ID, LummyLedger.Status.Released);
    }

    function test_resolve_needsDispute() public {
        _opened();
        vm.prank(operator);
        vm.expectRevert(LummyLedger.NotDisputed.selector);
        ledger.resolveDispute(ID, AMOUNT);
    }

    function test_resolve_neverAboveAmount() public {
        _opened();
        _dispute();
        vm.prank(operator);
        vm.expectRevert(LummyLedger.AmountAbovePrice.selector);
        ledger.resolveDispute(ID, AMOUNT + 1);
    }

    /// Bagian pembeli dan penjual selalu pas dengan yang ditahan, berapa pun nominalnya.
    function testFuzz_resolve_splitAddsUp(uint256 amount, uint256 toBuyer) public {
        amount = bound(amount, 1, type(uint128).max);
        toBuyer = bound(toBuyer, 0, amount);
        _open(ID, amount, PAY, COMMIT, showEnds);
        _dispute();
        vm.expectEmit(address(ledger));
        emit LummyLedger.Resolved(ID, toBuyer, amount - toBuyer);
        vm.prank(operator);
        ledger.resolveDispute(ID, toBuyer);
        _assertStatus(ID, toBuyer == 0 ? LummyLedger.Status.Released : LummyLedger.Status.Refunded);
    }

    // ================================================================
    // Jadwal acara
    // ================================================================

    /// Acara diundur: batas window ikut mundur, jadi jadwal lama tidak bisa dipakai untuk mencairkan.
    function test_postpone_movesDeadlineLater() public {
        _opened();
        uint40 later = showEnds + 7 days;
        vm.expectEmit(address(ledger));
        emit LummyLedger.EventPostponed(ID, later, uint256(later) + WINDOW);
        vm.prank(operator);
        ledger.postponeEvent(ID, later);
        assertEq(ledger.deadlineOf(ID), uint256(later) + WINDOW);

        vm.warp(uint256(showEnds) + WINDOW + 1);
        vm.expectRevert(LummyLedger.WindowNotElapsed.selector);
        ledger.release(ID);
    }

    function test_postpone_neverEarlierOrSame() public {
        _opened();
        vm.startPrank(operator);
        vm.expectRevert(LummyLedger.CannotMoveEventEarlier.selector);
        ledger.postponeEvent(ID, showEnds);
        vm.expectRevert(LummyLedger.CannotMoveEventEarlier.selector);
        ledger.postponeEvent(ID, showEnds - 1 hours);
        vm.stopPrank();
    }

    function test_postpone_closedAfterSilentWindow() public {
        _opened();
        _afterWindow();
        vm.prank(operator);
        vm.expectRevert(LummyLedger.WindowClosed.selector);
        ledger.postponeEvent(ID, showEnds + 7 days);
    }

    // ================================================================
    // Satu pembayaran, satu tiket
    // ================================================================

    function test_open_paymentOnlyOnce() public {
        _opened();
        vm.prank(operator);
        vm.expectRevert(LummyLedger.PaymentAlreadyUsed.selector);
        ledger.open(ID2, AMOUNT, PAY, keccak256("tiket-lain"), HANDOVER, showEnds);
    }

    /// Tiket yang pernah terjual tidak bisa dijual lagi lewat Lummy, juga setelah refund (keputusan A).
    function test_open_ticketOnlyOnce_evenAfterRefund() public {
        _opened();
        vm.prank(operator);
        ledger.refund(ID, LummyLedger.RefundReason.EventPostponed);
        vm.prank(operator);
        vm.expectRevert(LummyLedger.CommitAlreadyUsed.selector);
        ledger.open(ID2, AMOUNT, PAY2, COMMIT, HANDOVER, showEnds);
    }

    /// Tiket contoh tidak punya file, jadi tidak punya komitmen untuk dijaga.
    function test_open_sampleTicketsWithoutCommit() public {
        _open(ID, AMOUNT, PAY, bytes32(0), showEnds);
        _open(ID2, AMOUNT, PAY2, bytes32(0), showEnds);
        assertFalse(ledger.commitUsed(bytes32(0)));
    }

    function test_open_onlyOnce() public {
        _opened();
        vm.prank(operator);
        vm.expectRevert(_badStatus(LummyLedger.Status.Open));
        ledger.open(ID, AMOUNT, PAY2, bytes32(0), HANDOVER, showEnds);
    }

    function test_open_rejectsMissingFields() public {
        uint256 tooBig = uint256(type(uint128).max) + 1;
        vm.startPrank(operator);
        vm.expectRevert(LummyLedger.ZeroAmount.selector);
        ledger.open(ID, 0, PAY, COMMIT, HANDOVER, showEnds);
        vm.expectRevert(LummyLedger.NoPaymentRef.selector);
        ledger.open(ID, AMOUNT, bytes32(0), COMMIT, HANDOVER, showEnds);
        vm.expectRevert(LummyLedger.NoHandoverProof.selector);
        ledger.open(ID, AMOUNT, PAY, COMMIT, bytes32(0), showEnds);
        vm.expectRevert(LummyLedger.NoEventEnd.selector);
        ledger.open(ID, AMOUNT, PAY, COMMIT, HANDOVER, 0);
        vm.expectRevert(abi.encodeWithSelector(SafeCast.SafeCastOverflowedUintDowncast.selector, 128, tooBig));
        ledger.open(ID, tooBig, PAY, COMMIT, HANDOVER, showEnds);
        vm.stopPrank();
    }

    /// Catatan yang ditulis terlambat (acaranya sudah selesai) tetap sah, dan batasnya tetap dihitung
    /// dari acara, sama dengan aturan di aplikasi.
    function test_open_lateRecordKeepsEventDeadline() public {
        uint40 ended = _now40() - 1 days;
        _open(ID, AMOUNT, PAY, COMMIT, ended);
        assertEq(ledger.deadlineOf(ID), uint256(ended) + WINDOW);
    }

    // ================================================================
    // Hak akses dan catatan final
    // ================================================================

    function test_operatorOnly() public {
        bytes memory denied = abi.encodeWithSelector(
            IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, ledger.OPERATOR_ROLE()
        );
        vm.prank(stranger);
        vm.expectRevert(denied);
        ledger.open(ID, AMOUNT, PAY, COMMIT, HANDOVER, showEnds);

        _opened();
        vm.startPrank(stranger);
        vm.expectRevert(denied);
        ledger.raiseDispute(ID);
        vm.expectRevert(denied);
        ledger.refund(ID, LummyLedger.RefundReason.Other);
        vm.expectRevert(denied);
        ledger.resolveDispute(ID, 0);
        vm.expectRevert(denied);
        ledger.postponeEvent(ID, showEnds + 1 days);
        vm.stopPrank();
    }

    /// Kunci operator bisa diganti admin tanpa deploy ulang; yang lama langsung kehilangan aksesnya.
    function test_adminRotatesOperator() public {
        address next = makeAddr("operator-2");
        bytes32 role = ledger.OPERATOR_ROLE();
        vm.startPrank(admin);
        ledger.grantRole(role, next);
        ledger.revokeRole(role, operator);
        vm.stopPrank();

        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, operator, role)
        );
        ledger.open(ID, AMOUNT, PAY, COMMIT, HANDOVER, showEnds);
        vm.prank(next);
        ledger.open(ID, AMOUNT, PAY, COMMIT, HANDOVER, showEnds);
        _assertStatus(ID, LummyLedger.Status.Open);
    }

    function test_constructor_guards() public {
        vm.expectRevert(LummyLedger.ZeroAddress.selector);
        new LummyLedger(address(0), operator, WINDOW);
        vm.expectRevert(LummyLedger.ZeroAddress.selector);
        new LummyLedger(admin, address(0), WINDOW);
        vm.expectRevert(LummyLedger.WindowTooShort.selector);
        new LummyLedger(admin, operator, 5 minutes - 1);
    }

    /// Catatan yang sudah final tidak bisa disentuh lagi, oleh siapa pun.
    function test_finalRecordNeverChanges() public {
        _opened();
        vm.prank(operator);
        ledger.refund(ID, LummyLedger.RefundReason.EventCancelled);

        bytes memory refunded = _badStatus(LummyLedger.Status.Refunded);
        vm.startPrank(operator);
        vm.expectRevert(refunded);
        ledger.refund(ID, LummyLedger.RefundReason.Other);
        vm.expectRevert(refunded);
        ledger.raiseDispute(ID);
        vm.expectRevert(refunded);
        ledger.resolveDispute(ID, 0);
        vm.expectRevert(refunded);
        ledger.postponeEvent(ID, showEnds + 1 days);
        vm.stopPrank();
        _afterWindow();
        vm.expectRevert(refunded);
        ledger.release(ID);
    }

    function test_unknownOrder() public {
        vm.expectRevert(_badStatus(LummyLedger.Status.None));
        ledger.release(ID);
        assertEq(ledger.deadlineOf(ID), 0);
    }
}
