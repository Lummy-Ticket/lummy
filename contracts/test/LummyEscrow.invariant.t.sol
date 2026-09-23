// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {StdInvariant} from "forge-std/StdInvariant.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {LummyEscrow} from "../src/LummyEscrow.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {EscrowBase} from "./utils/EscrowBase.sol";
import {Signing} from "./utils/Signing.sol";

/// @notice Aktor acak untuk invariant test. Membuat, mendanai, menyerahkan, mengundur acara,
/// menyengketakan, mencairkan, me-refund, memutus, membatalkan, menarik, dan memajukan waktu dalam
/// urutan acak, sebagian lewat operator atas nama pengguna (Model A). Tiap aksi menyaring dirinya
/// sendiri, jadi revert yang muncul berarti bug di kontrak. Aksi `probe` sengaja mencoba hal yang
/// dilarang, dan tiap yang lolos dihitung di `violations`.
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
    uint256 public violations;
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

    function create(uint256 sellerSeed, uint256 priceSeed, uint256 eventSeed, bool viaOperator) external {
        uint256 price = bound(priceSeed, 1, escrow.priceCap());
        // Acara bisa sudah lama selesai atau masih beberapa hari lagi.
        uint40 eventEndsAt = SafeCast.toUint40(bound(eventSeed, 1, vm.getBlockTimestamp() + 5 days));
        bytes32 id = keccak256(abi.encode("id", counter));
        bytes32 commit = keccak256(abi.encode("commit", counter));
        counter++;
        address seller = sellers[sellerSeed % sellers.length];
        if (viaOperator) {
            vm.prank(operator);
            escrow.createListingFor(seller, id, price, commit, eventEndsAt);
        } else {
            vm.prank(seller);
            escrow.createListing(id, price, commit, eventEndsAt);
        }
        ids.push(id);
    }

    function fund(uint256 idSeed, uint256 buyerSeed) external {
        (bytes32 id, LummyEscrow.Listing memory L) = _pick(idSeed);
        if (L.status != LummyEscrow.Status.Listed) return;
        uint256 key = buyerKeys[buyerSeed % buyerKeys.length];
        _submit(escrow, id, _signFund(escrow, usdc, id, L.price, key, keccak256(abi.encode("auth", counter++))));
        totalFunded += L.price;
    }

    function handover(uint256 idSeed, bool viaOperator) external {
        (bytes32 id, LummyEscrow.Listing memory L) = _pick(idSeed);
        if (L.status != LummyEscrow.Status.Funded) return;
        vm.prank(viaOperator ? operator : L.seller);
        escrow.markHandover(id, keccak256(abi.encode("handover", id)));
    }

    function postpone(uint256 idSeed, uint256 delaySeed) external {
        (bytes32 id, LummyEscrow.Listing memory L) = _pick(idSeed);
        if (!_active(L) || _closed(L)) return;
        uint256 newEnd = uint256(L.eventEndsAt) + bound(delaySeed, 1, 7 days);
        vm.prank(operator);
        escrow.postponeEvent(id, SafeCast.toUint40(newEnd));
    }

    function dispute(uint256 idSeed, bool viaOperator) external {
        (bytes32 id, LummyEscrow.Listing memory L) = _pick(idSeed);
        if (L.disputed || !_locked(L) || _closed(L)) return;
        vm.prank(viaOperator ? operator : L.buyer);
        escrow.raiseDispute(id);
    }

    function release(uint256 idSeed, uint256 callerSeed) external {
        (bytes32 id, LummyEscrow.Listing memory L) = _pick(idSeed);
        if (L.status != LummyEscrow.Status.DisputeWindow || L.disputed) return;
        if (vm.getBlockTimestamp() <= _deadline(L)) return;
        vm.prank(_random(callerSeed));
        escrow.release(id);
    }

    function refund(uint256 idSeed) external {
        (bytes32 id, LummyEscrow.Listing memory L) = _pick(idSeed);
        if (!_locked(L) || _closed(L)) return;
        vm.prank(operator);
        escrow.refund(id);
    }

    function resolve(uint256 idSeed, uint256 amountSeed) external {
        (bytes32 id, LummyEscrow.Listing memory L) = _pick(idSeed);
        if (!L.disputed || !_locked(L)) return;
        vm.prank(operator);
        escrow.resolveDispute(id, bound(amountSeed, 0, L.price));
    }

    function cancel(uint256 idSeed, bool viaOperator) external {
        (bytes32 id, LummyEscrow.Listing memory L) = _pick(idSeed);
        if (L.status != LummyEscrow.Status.Listed) return;
        vm.prank(viaOperator ? operator : L.seller);
        escrow.cancelListing(id);
    }

    /// Penarikan sendiri, atau didorong siapa pun lewat `withdrawFor`. Dananya harus sampai persis ke
    /// pemiliknya, dan pemicunya tidak dapat apa-apa.
    function withdraw(uint256 actorSeed, uint256 callerSeed, bool pushed) external {
        address[] memory all = _actors();
        address who = all[actorSeed % all.length];
        uint256 amount = escrow.pending(who);
        if (amount == 0) return;
        uint256 before = usdc.balanceOf(who);
        if (pushed) {
            address caller = _random(callerSeed);
            vm.prank(caller);
            escrow.withdrawFor(who);
            assertEq(usdc.balanceOf(caller), 0, "pemicu withdrawFor tidak dapat dana");
        } else {
            vm.prank(who);
            escrow.withdraw();
        }
        assertEq(usdc.balanceOf(who) - before, amount, "pemilik menerima persis alokasinya");
        totalWithdrawn += amount;
    }

    function warp(uint256 secondsSeed) external {
        vm.warp(vm.getBlockTimestamp() + bound(secondsSeed, 1, 3 days));
    }

    /// Mencoba satu aksi terlarang untuk keadaan listing saat itu. Kontrak wajib menolaknya.
    function probe(uint256 idSeed, uint256 which, uint256 seed) external {
        (bytes32 id, LummyEscrow.Listing memory L) = _pick(idSeed);
        if (L.status == LummyEscrow.Status.None) return;
        which %= 4;

        if (which == 0) {
            // Rilis sebelum window lewat, saat disengketakan, atau dari status lain.
            bool allowed =
                L.status == LummyEscrow.Status.DisputeWindow && !L.disputed && vm.getBlockTimestamp() > _deadline(L);
            if (allowed) return;
            try escrow.release(id) {
                violations++;
            } catch {}
        } else if (which == 1) {
            // Refund setelah window tutup tanpa sengketa, atau dari status yang sudah selesai.
            if (_locked(L) && !_closed(L)) return;
            vm.prank(operator);
            try escrow.refund(id) {
                violations++;
            } catch {}
        } else if (which == 2) {
            // Memajukan jadwal acara, atau mengubah jadwal setelah window tutup.
            uint40 newEnd = _closed(L) ? L.eventEndsAt + 1 days : L.eventEndsAt - uint40(seed % L.eventEndsAt);
            vm.prank(operator);
            try escrow.postponeEvent(id, newEnd) {
                violations++;
            } catch {}
        } else {
            // Orang asing memanggil aksi milik seller, pembeli, atau operator.
            address stranger = _random(seed);
            uint256 action = seed % 4;
            vm.prank(stranger);
            if (action == 0) {
                try escrow.markHandover(id, keccak256("palsu")) {
                    violations++;
                } catch {}
            } else if (action == 1) {
                try escrow.raiseDispute(id) {
                    violations++;
                } catch {}
            } else if (action == 2) {
                try escrow.cancelListing(id) {
                    violations++;
                } catch {}
            } else {
                try escrow.refund(id) {
                    violations++;
                } catch {}
            }
        }
    }

    // ---------- pembukuan ----------

    function idCount() external view returns (uint256) {
        return ids.length;
    }

    function sumPending() external view returns (uint256 s) {
        address[] memory all = _actors();
        for (uint256 i; i < all.length; i++) {
            s += escrow.pending(all[i]);
        }
    }

    function sumLocked() external view returns (uint256 s) {
        for (uint256 i; i < ids.length; i++) {
            LummyEscrow.Listing memory L = listingOf(ids[i]);
            if (_locked(L)) s += L.price;
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
        L = listingOf(id);
    }

    function listingOf(bytes32 id) public view returns (LummyEscrow.Listing memory L) {
        (L.seller, L.buyer, L.price, L.handoverAt, L.eventEndsAt, L.status, L.disputed, L.barcodeCommit) =
            escrow.listings(id);
    }

    function _random(uint256 seed) internal pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encode("caller", seed)))));
    }

    function _locked(LummyEscrow.Listing memory L) internal pure returns (bool) {
        return L.status == LummyEscrow.Status.Funded || L.status == LummyEscrow.Status.DisputeWindow;
    }

    function _active(LummyEscrow.Listing memory L) internal pure returns (bool) {
        return L.status == LummyEscrow.Status.Listed || _locked(L);
    }

    function _deadline(LummyEscrow.Listing memory L) internal view returns (uint256) {
        uint256 start = L.handoverAt > L.eventEndsAt ? L.handoverAt : L.eventEndsAt;
        return start + escrow.disputeWindow();
    }

    function _closed(LummyEscrow.Listing memory L) internal view returns (bool) {
        return L.status == LummyEscrow.Status.DisputeWindow && !L.disputed && vm.getBlockTimestamp() > _deadline(L);
    }
}

contract LummyEscrowInvariantTest is EscrowBase {
    Handler internal handler;

    function setUp() public override {
        super.setUp();
        handler = new Handler(escrow, usdc, operator);

        bytes4[] memory selectors = new bytes4[](12);
        selectors[0] = Handler.create.selector;
        selectors[1] = Handler.fund.selector;
        selectors[2] = Handler.handover.selector;
        selectors[3] = Handler.postpone.selector;
        selectors[4] = Handler.dispute.selector;
        selectors[5] = Handler.release.selector;
        selectors[6] = Handler.refund.selector;
        selectors[7] = Handler.resolve.selector;
        selectors[8] = Handler.cancel.selector;
        selectors[9] = Handler.withdraw.selector;
        selectors[10] = Handler.warp.selector;
        selectors[11] = Handler.probe.selector;
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

    /// Operator dan admin tidak pernah mendapat alokasi, walau operator mengirim aksi atas nama pengguna.
    function invariant_operatorAndAdminNeverCredited() public view {
        assertEq(escrow.pending(operator), 0);
        assertEq(escrow.pending(admin), 0);
        assertEq(usdc.balanceOf(operator), 0);
    }

    /// Tidak ada aksi terlarang yang lolos, di keadaan apa pun yang dicapai urutan acak.
    function invariant_forbiddenActionsAlwaysRevert() public view {
        assertEq(handler.violations(), 0);
    }

    /// Komitmen barcode terkunci selama tiketnya pernah atau sedang dijual, dan cuma lepas lewat
    /// pembatalan sebelum ada pembeli (keputusan A).
    function invariant_commitTracksListing() public view {
        for (uint256 i; i < handler.idCount(); i++) {
            LummyEscrow.Listing memory L = handler.listingOf(handler.ids(i));
            assertEq(escrow.commitUsed(L.barcodeCommit), L.status != LummyEscrow.Status.Cancelled);
        }
    }
}
