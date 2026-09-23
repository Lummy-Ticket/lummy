// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {StdInvariant} from "forge-std/StdInvariant.sol";
import {LummyEscrow} from "../src/LummyEscrow.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {EscrowBase} from "./utils/EscrowBase.sol";
import {Signing} from "./utils/Signing.sol";

/// @notice Aktor acak untuk invariant test. Membuat, mendanai, menyerahkan, menyengketakan, mencairkan,
/// me-refund, memutus, membatalkan, menarik, dan memajukan waktu dalam urutan acak. Tiap aksi
/// menyaring dirinya sendiri, jadi revert yang muncul berarti bug di kontrak.
contract Handler is Signing {
    LummyEscrow internal immutable escrow;
    MockUSDC internal immutable usdc;
    address internal immutable operator;

    address[] internal sellers;
    address[] internal buyers;
    uint256[] internal buyerKeys;
    bytes32[] public ids;

    uint256 public totalFunded;
    uint256 public totalWithdrawn;
    uint256 internal counter;

    constructor(LummyEscrow escrow_, MockUSDC usdc_, address operator_) {
        escrow = escrow_;
        usdc = usdc_;
        operator = operator_;
        for (uint256 i; i < 3; i++) {
            sellers.push(makeAddr(string.concat("seller-", vm.toString(i))));
            (address b, uint256 k) = makeAddrAndKey(string.concat("buyer-", vm.toString(i)));
            buyers.push(b);
            buyerKeys.push(k);
            usdc.mint(b, 1e30);
        }
    }

    // ---------- aksi ----------

    function create(uint256 sellerSeed, uint256 priceSeed) external {
        uint256 price = bound(priceSeed, 1, escrow.priceCap());
        bytes32 id = keccak256(abi.encode("id", counter));
        bytes32 commit = keccak256(abi.encode("commit", counter));
        counter++;
        vm.prank(sellers[sellerSeed % sellers.length]);
        escrow.createListing(id, price, commit);
        ids.push(id);
    }

    function fund(uint256 idSeed, uint256 buyerSeed) external {
        (bytes32 id, LummyEscrow.Listing memory L) = _pick(idSeed);
        if (L.status != LummyEscrow.Status.Listed) return;
        uint256 key = buyerKeys[buyerSeed % buyerKeys.length];
        _submit(escrow, id, _signFund(escrow, usdc, id, L.price, key, keccak256(abi.encode("auth", counter++))));
        totalFunded += L.price;
    }

    function handover(uint256 idSeed) external {
        (bytes32 id, LummyEscrow.Listing memory L) = _pick(idSeed);
        if (L.status != LummyEscrow.Status.Funded) return;
        vm.prank(L.seller);
        escrow.markHandover(id);
    }

    function dispute(uint256 idSeed) external {
        (bytes32 id, LummyEscrow.Listing memory L) = _pick(idSeed);
        if (L.disputed) return;
        bool open = L.status == LummyEscrow.Status.Funded
            || (L.status == LummyEscrow.Status.DisputeWindow && vm.getBlockTimestamp() <= _deadline(L));
        if (!open) return;
        vm.prank(L.buyer);
        escrow.raiseDispute(id);
    }

    function release(uint256 idSeed, uint256 callerSeed) external {
        (bytes32 id, LummyEscrow.Listing memory L) = _pick(idSeed);
        if (L.status != LummyEscrow.Status.DisputeWindow || L.disputed) return;
        if (vm.getBlockTimestamp() <= _deadline(L)) return;
        vm.prank(address(uint160(uint256(keccak256(abi.encode("caller", callerSeed))))));
        escrow.release(id);
    }

    function refund(uint256 idSeed) external {
        (bytes32 id, LummyEscrow.Listing memory L) = _pick(idSeed);
        if (L.status != LummyEscrow.Status.Funded && L.status != LummyEscrow.Status.DisputeWindow) return;
        vm.prank(operator);
        escrow.refund(id);
    }

    function resolve(uint256 idSeed, uint256 amountSeed) external {
        (bytes32 id, LummyEscrow.Listing memory L) = _pick(idSeed);
        if (!L.disputed) return;
        if (L.status != LummyEscrow.Status.Funded && L.status != LummyEscrow.Status.DisputeWindow) return;
        vm.prank(operator);
        escrow.resolveDispute(id, bound(amountSeed, 0, L.price));
    }

    function cancel(uint256 idSeed) external {
        (bytes32 id, LummyEscrow.Listing memory L) = _pick(idSeed);
        if (L.status != LummyEscrow.Status.Listed) return;
        vm.prank(L.seller);
        escrow.cancelListing(id);
    }

    function withdraw(uint256 actorSeed) external {
        address[] memory all = _actors();
        address who = all[actorSeed % all.length];
        uint256 amount = escrow.pending(who);
        if (amount == 0) return;
        vm.prank(who);
        escrow.withdraw();
        totalWithdrawn += amount;
    }

    function warp(uint256 secondsSeed) external {
        vm.warp(vm.getBlockTimestamp() + bound(secondsSeed, 1, 3 days));
    }

    // ---------- pembukuan ----------

    function sumPending() external view returns (uint256 s) {
        address[] memory all = _actors();
        for (uint256 i; i < all.length; i++) {
            s += escrow.pending(all[i]);
        }
    }

    function sumLocked() external view returns (uint256 s) {
        for (uint256 i; i < ids.length; i++) {
            LummyEscrow.Listing memory L = _get(ids[i]);
            if (L.status == LummyEscrow.Status.Funded || L.status == LummyEscrow.Status.DisputeWindow) s += L.price;
        }
    }

    function _actors() internal view returns (address[] memory all) {
        all = new address[](sellers.length + buyers.length);
        for (uint256 i; i < sellers.length; i++) {
            all[i] = sellers[i];
        }
        for (uint256 i; i < buyers.length; i++) {
            all[sellers.length + i] = buyers[i];
        }
    }

    function _pick(uint256 seed) internal view returns (bytes32 id, LummyEscrow.Listing memory L) {
        if (ids.length == 0) return (id, L);
        id = ids[seed % ids.length];
        L = _get(id);
    }

    function _get(bytes32 id) internal view returns (LummyEscrow.Listing memory L) {
        (L.seller, L.buyer, L.price, L.handoverAt, L.status, L.disputed, L.barcodeCommit) = escrow.listings(id);
    }

    function _deadline(LummyEscrow.Listing memory L) internal view returns (uint256) {
        return uint256(L.handoverAt) + escrow.disputeWindow();
    }
}

contract LummyEscrowInvariantTest is EscrowBase {
    Handler internal handler;

    function setUp() public override {
        super.setUp();
        handler = new Handler(escrow, usdc, operator);

        bytes4[] memory selectors = new bytes4[](10);
        selectors[0] = Handler.create.selector;
        selectors[1] = Handler.fund.selector;
        selectors[2] = Handler.handover.selector;
        selectors[3] = Handler.dispute.selector;
        selectors[4] = Handler.release.selector;
        selectors[5] = Handler.refund.selector;
        selectors[6] = Handler.resolve.selector;
        selectors[7] = Handler.cancel.selector;
        selectors[8] = Handler.withdraw.selector;
        selectors[9] = Handler.warp.selector;
        targetContract(address(handler));
        targetSelector(StdInvariant.FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    /// Saldo kontrak = alokasi yang belum ditarik + dana yang masih terkunci. Kalau satu unit pun
    /// dialokasikan ke alamat di luar pembeli dan seller, persamaan ini pecah.
    function invariant_balanceMatchesBooks() public view {
        assertEq(usdc.balanceOf(address(escrow)), handler.sumPending() + handler.sumLocked());
    }

    /// Uang masuk = uang yang masih di kontrak + uang yang sudah ditarik pemiliknya.
    function invariant_moneyInEqualsMoneyOut() public view {
        assertEq(handler.totalFunded(), usdc.balanceOf(address(escrow)) + handler.totalWithdrawn());
    }

    /// Operator dan admin tidak pernah mendapat alokasi.
    function invariant_operatorAndAdminNeverCredited() public view {
        assertEq(escrow.pending(operator), 0);
        assertEq(escrow.pending(admin), 0);
    }
}
