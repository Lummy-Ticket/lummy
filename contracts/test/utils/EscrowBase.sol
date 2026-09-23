// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {LummyEscrow} from "../../src/LummyEscrow.sol";
import {MockUSDC} from "../../src/MockUSDC.sol";
import {Signing} from "./Signing.sol";

/// @notice Setup bersama: satu escrow dengan window produksi 48 jam, satu seller, satu pembeli.
abstract contract EscrowBase is Signing {
    uint64 internal constant WINDOW = 48 hours;
    uint256 internal constant CAP = 5_000e6; // plafon absolut 5.000 USDC
    uint256 internal constant PRICE = 150e6; // kira-kira satu tiket CAT 1
    bytes32 internal constant HANDOVER = keccak256("paket-serah-terima"); // hash surat kuasa + dokumen

    MockUSDC internal usdc;
    LummyEscrow internal escrow;

    address internal admin = makeAddr("admin");
    address internal operator = makeAddr("operator");
    address internal stranger = makeAddr("stranger");
    address internal seller = makeAddr("seller");
    address internal buyer;
    uint256 internal buyerKey;

    function setUp() public virtual {
        (buyer, buyerKey) = makeAddrAndKey("buyer");
        usdc = new MockUSDC();
        escrow = new LummyEscrow(usdc, admin, operator, CAP, WINDOW);
        usdc.mint(buyer, 10_000e6);
    }

    /// @dev Waktu sekarang sebagai uint40, format `eventEndsAt`.
    function _now40() internal view returns (uint40) {
        return SafeCast.toUint40(vm.getBlockTimestamp());
    }

    /// @dev Listing oleh seller sendiri dengan acara yang sudah selesai, jadi window dihitung dari serah terima.
    function _list(bytes32 id, uint256 price, bytes32 commit) internal {
        _listWithEvent(id, price, commit, _now40());
    }

    function _listWithEvent(bytes32 id, uint256 price, bytes32 commit, uint40 eventEndsAt) internal {
        vm.prank(seller);
        escrow.createListing(id, price, commit, eventEndsAt);
    }

    function _fund(bytes32 id, uint256 value) internal {
        _submit(escrow, id, _signFund(escrow, usdc, id, value, buyerKey, keccak256(abi.encode("auth", id))));
    }

    function _listing(bytes32 id) internal view returns (LummyEscrow.Listing memory L) {
        (L.seller, L.buyer, L.price, L.handoverAt, L.eventEndsAt, L.status, L.disputed, L.barcodeCommit) =
            escrow.listings(id);
    }

    /// @dev Batas window: `disputeWindow` setelah yang terakhir dari serah terima dan acara selesai.
    function _deadline(bytes32 id) internal view returns (uint256) {
        LummyEscrow.Listing memory L = _listing(id);
        return uint256(L.handoverAt > L.eventEndsAt ? L.handoverAt : L.eventEndsAt) + WINDOW;
    }

    function _assertStatus(bytes32 id, LummyEscrow.Status want) internal view {
        assertEq(uint8(_listing(id).status), uint8(want), "status");
    }

    /// @dev Tarik dana, lalu pastikan yang diterima persis `amount` dan alokasinya habis.
    function _withdrawAndCheck(address payee, uint256 amount) internal {
        uint256 before = usdc.balanceOf(payee);
        vm.prank(payee);
        escrow.withdraw();
        assertEq(usdc.balanceOf(payee) - before, amount, "jumlah diterima");
        assertEq(escrow.pending(payee), 0, "alokasi tersisa");
    }
}
