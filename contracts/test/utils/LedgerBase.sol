// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {LummyLedger} from "../../src/LummyLedger.sol";

/// @notice Setup bersama: satu buku besar dengan window produksi 48 jam, jam di waktu yang realistis.
abstract contract LedgerBase is Test {
    uint64 internal constant WINDOW = 48 hours;
    uint256 internal constant AMOUNT = 1_500_000; // Rp1,5 juta, kira-kira satu tiket CAT 1
    bytes32 internal constant HANDOVER = keccak256("paket-serah-terima"); // hash file tiket + surat kuasa

    LummyLedger internal ledger;

    address internal admin = makeAddr("admin");
    address internal operator = makeAddr("operator");
    address internal stranger = makeAddr("stranger");

    function setUp() public virtual {
        // Okt 2025: acara yang sudah lewat berhari-hari tetap punya timestamp positif.
        vm.warp(1_760_000_000);
        ledger = new LummyLedger(admin, operator, WINDOW);
    }

    /// @dev Waktu sekarang sebagai uint40, format `eventEndsAt`.
    function _now40() internal view returns (uint40) {
        return SafeCast.toUint40(vm.getBlockTimestamp());
    }

    function _open(bytes32 id, uint256 amount, bytes32 paymentRef, bytes32 commit, uint40 eventEndsAt) internal {
        vm.prank(operator);
        ledger.open(id, amount, paymentRef, commit, HANDOVER, eventEndsAt);
    }

    function _order(bytes32 id) internal view returns (LummyLedger.Order memory O) {
        (O.amount, O.openedAt, O.eventEndsAt, O.status, O.disputed) = ledger.orders(id);
    }
}
