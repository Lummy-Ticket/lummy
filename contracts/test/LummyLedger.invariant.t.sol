// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {LummyLedger} from "../src/LummyLedger.sol";
import {LedgerBase} from "./utils/LedgerBase.sol";

/// @notice Aktor acak untuk invariant test buku besar. Mencatat pembayaran, mengundur acara,
/// menyengketakan, mencairkan, me-refund, memutus, dan memajukan waktu dalam urutan acak. Tiap aksi
/// menyaring dirinya sendiri, jadi revert yang muncul berarti bug. Aksi `probe` sengaja mencoba hal
/// yang dilarang, dan tiap yang lolos dihitung di `violations`.
contract LedgerHandler is Test {
    bytes32 internal constant HANDOVER = keccak256("paket-serah-terima");

    LummyLedger internal immutable ledger;
    address internal immutable operator;

    bytes32[] public ids;
    mapping(bytes32 id => bytes32) public paymentOf;
    mapping(bytes32 id => bytes32) public commitOf;
    /// @dev Status saat catatan ditutup handler. None = masih terbuka.
    mapping(bytes32 id => LummyLedger.Status) public closedAs;
    mapping(bytes32 id => bool) public disputedEver;

    uint256 public violations;
    uint256 internal counter;

    constructor(LummyLedger ledger_, address operator_) {
        ledger = ledger_;
        operator = operator_;
    }

    // ---------- aksi ----------

    function open(uint256 amountSeed, uint256 eventSeed, bool withTicket) external {
        uint256 amount = bound(amountSeed, 1, 10_000_000); // batas satu pembayaran QRIS
        // Acara bisa sudah lama selesai (catatan terlambat) atau masih beberapa hari lagi.
        uint40 eventEndsAt = SafeCast.toUint40(bound(eventSeed, 1, vm.getBlockTimestamp() + 5 days));
        bytes32 id = keccak256(abi.encode("order", counter));
        bytes32 pay = keccak256(abi.encode("payment", counter));
        bytes32 commit = withTicket ? keccak256(abi.encode("commit", counter)) : bytes32(0);
        counter++;
        vm.prank(operator);
        ledger.open(id, amount, pay, commit, HANDOVER, eventEndsAt);
        ids.push(id);
        paymentOf[id] = pay;
        commitOf[id] = commit;
    }

    function postpone(uint256 idSeed, uint256 delaySeed) external {
        (bytes32 id, LummyLedger.Order memory O) = _pick(idSeed);
        if (O.status != LummyLedger.Status.Open || _closed(O)) return;
        uint256 newEnd = uint256(O.eventEndsAt) + bound(delaySeed, 1, 7 days);
        vm.prank(operator);
        ledger.postponeEvent(id, SafeCast.toUint40(newEnd));
    }

    function dispute(uint256 idSeed) external {
        (bytes32 id, LummyLedger.Order memory O) = _pick(idSeed);
        if (O.status != LummyLedger.Status.Open || O.disputed || _closed(O)) return;
        vm.prank(operator);
        ledger.raiseDispute(id);
        disputedEver[id] = true;
    }

    function release(uint256 idSeed, uint256 callerSeed) external {
        (bytes32 id, LummyLedger.Order memory O) = _pick(idSeed);
        if (O.status != LummyLedger.Status.Open || O.disputed) return;
        if (vm.getBlockTimestamp() <= _deadline(O)) return;
        vm.prank(_random(callerSeed));
        ledger.release(id);
        closedAs[id] = LummyLedger.Status.Released;
    }

    function refund(uint256 idSeed, uint8 reasonSeed) external {
        (bytes32 id, LummyLedger.Order memory O) = _pick(idSeed);
        if (O.status != LummyLedger.Status.Open || _closed(O)) return;
        vm.prank(operator);
        ledger.refund(id, LummyLedger.RefundReason(reasonSeed % 3));
        closedAs[id] = LummyLedger.Status.Refunded;
    }

    function resolve(uint256 idSeed, uint256 amountSeed) external {
        (bytes32 id, LummyLedger.Order memory O) = _pick(idSeed);
        if (O.status != LummyLedger.Status.Open || !O.disputed) return;
        uint256 toBuyer = bound(amountSeed, 0, O.amount);
        vm.prank(operator);
        ledger.resolveDispute(id, toBuyer);
        closedAs[id] = toBuyer == 0 ? LummyLedger.Status.Released : LummyLedger.Status.Refunded;
    }

    function warp(uint256 secondsSeed) external {
        vm.warp(vm.getBlockTimestamp() + bound(secondsSeed, 1, 3 days));
    }

    /// Mencoba satu aksi terlarang untuk keadaan catatan saat itu. Kontrak wajib menolaknya.
    function probe(uint256 idSeed, uint256 which, uint256 seed) external {
        (bytes32 id, LummyLedger.Order memory O) = _pick(idSeed);
        if (O.status == LummyLedger.Status.None) return;
        bool live = O.status == LummyLedger.Status.Open && !_closed(O);
        which %= 5;

        if (which == 0) {
            // Pencairan sebelum window lewat, saat disengketakan, atau dari catatan yang sudah final.
            bool allowed = O.status == LummyLedger.Status.Open && !O.disputed && vm.getBlockTimestamp() > _deadline(O);
            if (allowed) return;
            try ledger.release(id) {
                violations++;
            } catch {}
        } else if (which == 1) {
            // Refund setelah window tutup tanpa sengketa, atau dari catatan yang sudah final.
            if (live) return;
            vm.prank(operator);
            try ledger.refund(id, LummyLedger.RefundReason.Other) {
                violations++;
            } catch {}
        } else if (which == 2) {
            // Memajukan jadwal (atau jadwal yang sama) selagi terbuka; mengubah jadwal setelah itu.
            uint40 newEnd = live ? O.eventEndsAt - uint40(seed % O.eventEndsAt) : O.eventEndsAt + 1 days;
            vm.prank(operator);
            try ledger.postponeEvent(id, newEnd) {
                violations++;
            } catch {}
        } else if (which == 3) {
            // Pesanan baru yang memakai pembayaran atau tiket yang sudah tercatat.
            bytes32 fresh = keccak256(abi.encode("probe", counter++));
            bytes32 commit = commitOf[id];
            bool reusePayment = seed % 2 == 0 || commit == bytes32(0);
            bytes32 pay = reusePayment ? paymentOf[id] : keccak256(abi.encode("fresh-payment", fresh));
            vm.prank(operator);
            try ledger.open(fresh, 1, pay, reusePayment ? bytes32(0) : commit, HANDOVER, O.eventEndsAt) {
                violations++;
            } catch {}
        } else {
            // Orang asing memanggil aksi milik operator.
            uint256 action = seed % 4;
            vm.prank(_random(seed));
            if (action == 0) {
                try ledger.raiseDispute(id) {
                    violations++;
                } catch {}
            } else if (action == 1) {
                try ledger.refund(id, LummyLedger.RefundReason.Other) {
                    violations++;
                } catch {}
            } else if (action == 2) {
                try ledger.resolveDispute(id, 0) {
                    violations++;
                } catch {}
            } else {
                try ledger.postponeEvent(id, O.eventEndsAt + 1 days) {
                    violations++;
                } catch {}
            }
        }
    }

    // ---------- pembukuan ----------

    function idCount() external view returns (uint256) {
        return ids.length;
    }

    function orderOf(bytes32 id) public view returns (LummyLedger.Order memory O) {
        (O.amount, O.openedAt, O.eventEndsAt, O.status, O.disputed) = ledger.orders(id);
    }

    function _pick(uint256 seed) internal view returns (bytes32 id, LummyLedger.Order memory O) {
        if (ids.length == 0) return (id, O);
        id = ids[seed % ids.length];
        O = orderOf(id);
    }

    function _random(uint256 seed) internal pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encode("caller", seed)))));
    }

    function _deadline(LummyLedger.Order memory O) internal view returns (uint256) {
        return uint256(O.eventEndsAt) + ledger.disputeWindow();
    }

    function _closed(LummyLedger.Order memory O) internal view returns (bool) {
        return !O.disputed && vm.getBlockTimestamp() > _deadline(O);
    }
}

contract LummyLedgerInvariantTest is LedgerBase {
    LedgerHandler internal handler;

    function setUp() public override {
        super.setUp();
        handler = new LedgerHandler(ledger, operator);

        bytes4[] memory selectors = new bytes4[](8);
        selectors[0] = LedgerHandler.open.selector;
        selectors[1] = LedgerHandler.postpone.selector;
        selectors[2] = LedgerHandler.dispute.selector;
        selectors[3] = LedgerHandler.release.selector;
        selectors[4] = LedgerHandler.refund.selector;
        selectors[5] = LedgerHandler.resolve.selector;
        selectors[6] = LedgerHandler.warp.selector;
        selectors[7] = LedgerHandler.probe.selector;
        targetContract(address(handler));
        targetSelector(StdInvariant.FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    /// Tidak ada aksi terlarang yang lolos, di keadaan apa pun yang dicapai urutan acak.
    function invariant_forbiddenActionsAlwaysRevert() public view {
        assertEq(handler.violations(), 0);
    }

    /// Status tiap catatan persis yang dibuat aksi sah terakhirnya: yang final tidak pernah berubah, dan
    /// yang belum ditutup handler tetap terbuka, apa pun yang dicoba `probe`.
    function invariant_statusOnlyMovesThroughAllowedSteps() public view {
        for (uint256 i; i < handler.idCount(); i++) {
            bytes32 id = handler.ids(i);
            LummyLedger.Status expected = handler.closedAs(id);
            if (expected == LummyLedger.Status.None) expected = LummyLedger.Status.Open;
            assertEq(uint8(handler.orderOf(id).status), uint8(expected));
        }
    }

    /// Tanda sengketa cuma bisa dipasang, tidak pernah dicabut diam-diam.
    function invariant_disputeFlagSticks() public view {
        for (uint256 i; i < handler.idCount(); i++) {
            bytes32 id = handler.ids(i);
            assertEq(handler.orderOf(id).disputed, handler.disputedEver(id));
        }
    }

    /// Tiap pembayaran dan tiket yang pernah tercatat tetap terkunci selamanya (keputusan A).
    function invariant_paymentsAndTicketsStayUsed() public view {
        for (uint256 i; i < handler.idCount(); i++) {
            bytes32 id = handler.ids(i);
            assertTrue(ledger.paymentUsed(handler.paymentOf(id)));
            bytes32 commit = handler.commitOf(id);
            if (commit != bytes32(0)) assertTrue(ledger.commitUsed(commit));
        }
        assertFalse(ledger.commitUsed(bytes32(0)));
    }
}
