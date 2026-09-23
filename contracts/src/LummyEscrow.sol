// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {IERC3009} from "./interfaces/IERC3009.sol";

/// @title LummyEscrow
/// @notice Escrow resale tiket konser. Dana pembeli dikunci sampai window sengketa lewat, lalu cair
/// ke seller, atau kembali ke pembeli lewat refund atau putusan sengketa.
/// @dev Dana cuma pernah dialokasikan ke seller dan/atau pembeli listing itu, dan cuma keluar lewat
/// `withdraw`. Tidak ada sweep, tidak ada call sembarang, token dikunci saat deploy, dan kontrak
/// tidak pernah memotong fee. Kalau kunci operator bocor, akibat terburuknya salah waktu, tidak
/// pernah salah penerima. Keputusan desainnya di docs/09-technical-design.md, "Keputusan terkunci".
contract LummyEscrow is AccessControl, EIP712, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    /// @notice Kunci panas backend: cuma `refund` dan `resolveDispute`.
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    /// @notice Niat beli pembeli. Mengikat otorisasi ERC-3009 (lewat `authNonce`) ke satu listing,
    /// supaya relayer tidak bisa memakainya untuk listing lain dengan harga yang sama.
    bytes32 public constant FUND_TYPEHASH =
        keccak256("Fund(bytes32 listingId,address buyer,uint256 value,bytes32 authNonce,uint256 deadline)");

    /// @notice Batas bawah window sengketa, penjaga salah ketik saat deploy (mis. 48 detik).
    uint64 public constant MIN_DISPUTE_WINDOW = 5 minutes;

    /// @dev Urutan ini load-bearing: viem dan Postgres memakai index yang sama (docs/09, reconcile #1).
    enum Status {
        None,
        Listed,
        Funded,
        DisputeWindow,
        Released,
        Refunded,
        Cancelled
    }

    struct Listing {
        address seller;
        address buyer;
        uint128 price;
        uint40 handoverAt;
        Status status;
        bool disputed;
        bytes32 barcodeCommit;
    }

    IERC20 public immutable TOKEN;
    uint64 public immutable disputeWindow;
    uint256 public priceCap;

    mapping(bytes32 listingId => Listing) public listings;
    mapping(address payee => uint256 amount) public pending;
    mapping(bytes32 commit => bool) public commitUsed;

    event Listed(bytes32 indexed id, address indexed seller, uint256 price, bytes32 barcodeCommit);
    event ListingCancelled(bytes32 indexed id);
    event Funded(bytes32 indexed id, address indexed buyer, uint256 price);
    event HandoverMarked(bytes32 indexed id, uint256 disputeDeadline);
    event DisputeRaised(bytes32 indexed id);
    event Released(bytes32 indexed id, address indexed seller, uint256 amount);
    event Refunded(bytes32 indexed id, address indexed buyer, uint256 amount);
    event Resolved(bytes32 indexed id, uint256 toBuyer, uint256 toSeller);
    event Withdrawn(address indexed payee, uint256 amount);
    event PriceCapSet(uint256 priceCap);

    error ZeroAddress();
    error WindowTooShort();
    error BadStatus(Status current);
    error PriceZeroOrAboveCap();
    error ZeroCommit();
    error CommitAlreadyUsed();
    error NotSeller();
    error NotBuyer();
    error ExpiredDeadline();
    error BadSignature();
    error TransferMismatch();
    error WindowNotElapsed();
    error WindowClosed();
    error AlreadyDisputed();
    error IsDisputed();
    error NotDisputed();
    error AmountAbovePrice();
    error NothingToWithdraw();

    constructor(IERC20 token, address admin, address operator, uint256 priceCap_, uint64 disputeWindow_)
        EIP712("Lummy", "1")
    {
        if (address(token) == address(0) || admin == address(0) || operator == address(0)) revert ZeroAddress();
        if (disputeWindow_ < MIN_DISPUTE_WINDOW) revert WindowTooShort();
        TOKEN = token;
        disputeWindow = disputeWindow_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, operator);
        _setPriceCap(priceCap_);
    }

    // ------------------------------------------------------------------
    // Listing
    // ------------------------------------------------------------------

    /// @notice Pasang listing. Komitmen barcode yang sudah terpakai ditolak (keputusan A).
    function createListing(bytes32 id, uint256 price, bytes32 barcodeCommit) external {
        Listing storage L = listings[id];
        if (L.status != Status.None) revert BadStatus(L.status);
        if (price == 0 || price > priceCap) revert PriceZeroOrAboveCap();
        if (barcodeCommit == bytes32(0)) revert ZeroCommit();
        if (commitUsed[barcodeCommit]) revert CommitAlreadyUsed();

        commitUsed[barcodeCommit] = true;
        L.seller = msg.sender;
        L.price = SafeCast.toUint128(price);
        L.status = Status.Listed;
        L.barcodeCommit = barcodeCommit;
        emit Listed(id, msg.sender, price, barcodeCommit);
    }

    /// @notice Tarik listing sebelum ada pembeli. Satu-satunya jalan komitmen barcode dilepas,
    /// karena tiketnya belum pernah terjual.
    function cancelListing(bytes32 id) external {
        Listing storage L = listings[id];
        if (L.status != Status.Listed) revert BadStatus(L.status);
        if (msg.sender != L.seller) revert NotSeller();

        L.status = Status.Cancelled;
        commitUsed[L.barcodeCommit] = false;
        emit ListingCancelled(id);
    }

    // ------------------------------------------------------------------
    // Pendanaan
    // ------------------------------------------------------------------

    /// @notice Kunci dana pembeli. Siapa pun boleh mengirim transaksinya (relayer), tapi butuh dua
    /// tanda tangan pembeli: otorisasi ERC-3009 ke escrow, dan niat beli EIP-712 untuk listing ini.
    /// @dev Tanpa nonce berurutan: nonce otorisasi ERC-3009 sudah acak dan sekali pakai, jadi beberapa
    /// checkout pembeli yang sama bisa dikirim dalam urutan apa pun.
    function fund(
        bytes32 id,
        address from,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 authNonce,
        bytes calldata erc3009Sig,
        uint256 deadline,
        bytes calldata fundSig
    ) external nonReentrant {
        Listing storage L = listings[id];
        if (L.status != Status.Listed) revert BadStatus(L.status);
        if (value != L.price || value > priceCap) revert PriceZeroOrAboveCap();
        if (block.timestamp > deadline) revert ExpiredDeadline();
        _verifyIntent(id, from, value, authNonce, deadline, fundSig);

        // Effects dulu, baru interaksi (CEI).
        L.buyer = from;
        L.status = Status.Funded;
        // Panggilan luar sebelum baris ini cuma staticcall EIP-1271 di cek tanda tangan, tidak bisa reentrancy.
        // forge-lint: disable-next-line(reentrancy-events)
        emit Funded(id, from, value);

        _pull(from, value, validAfter, validBefore, authNonce, erc3009Sig);
    }

    // ------------------------------------------------------------------
    // Serah terima dan sengketa
    // ------------------------------------------------------------------

    /// @notice Mulai window sengketa. Dipanggil seller saat tiket sudah diserahkan atau acara selesai.
    function markHandover(bytes32 id) external {
        Listing storage L = listings[id];
        if (L.status != Status.Funded) revert BadStatus(L.status);
        if (msg.sender != L.seller) revert NotSeller();

        L.status = Status.DisputeWindow;
        L.handoverAt = SafeCast.toUint40(block.timestamp);
        emit HandoverMarked(id, _deadline(L));
    }

    /// @notice Pembeli mengajukan sengketa. Boleh sejak dana terkunci (klaim sebelum acara) sampai
    /// tepat di batas window. Selama `disputed`, `release` ditolak dan cuma operator yang bisa
    /// menyelesaikan (keputusan B).
    function raiseDispute(bytes32 id) external {
        Listing storage L = listings[id];
        if (msg.sender != L.buyer) revert NotBuyer();
        if (L.disputed) revert AlreadyDisputed();
        if (L.status == Status.DisputeWindow) {
            if (block.timestamp > _deadline(L)) revert WindowClosed();
        } else if (L.status != Status.Funded) {
            revert BadStatus(L.status);
        }

        L.disputed = true;
        emit DisputeRaised(id);
    }

    // ------------------------------------------------------------------
    // Penyelesaian
    // ------------------------------------------------------------------

    /// @notice Cairkan ke seller setelah window lewat tanpa sengketa. Siapa pun boleh memanggil, tapi
    /// dananya cuma bisa ke seller, jadi kalau backend mati seller tetap bisa cair (keputusan B).
    function release(bytes32 id) external {
        Listing storage L = listings[id];
        if (L.status != Status.DisputeWindow) revert BadStatus(L.status);
        if (L.disputed) revert IsDisputed();
        if (block.timestamp <= _deadline(L)) revert WindowNotElapsed();

        L.status = Status.Released;
        pending[L.seller] += L.price;
        emit Released(id, L.seller, L.price);
    }

    /// @notice Refund penuh ke pembeli sebelum dana cair: seller tidak menyerahkan tiket, acara
    /// dibatalkan, atau alasan lain yang sudah diputuskan di luar kontrak.
    function refund(bytes32 id) external onlyRole(OPERATOR_ROLE) {
        Listing storage L = listings[id];
        if (L.status != Status.Funded && L.status != Status.DisputeWindow) revert BadStatus(L.status);

        L.status = Status.Refunded;
        pending[L.buyer] += L.price;
        emit Refunded(id, L.buyer, L.price);
    }

    /// @notice Putusan sengketa: pembeli dapat `toBuyer`, seller dapat sisanya. Operator cuma memilih
    /// pembagian di antara keduanya, tidak pernah penerima ketiga (keputusan C).
    function resolveDispute(bytes32 id, uint256 toBuyer) external onlyRole(OPERATOR_ROLE) {
        Listing storage L = listings[id];
        if (L.status != Status.Funded && L.status != Status.DisputeWindow) revert BadStatus(L.status);
        if (!L.disputed) revert NotDisputed();
        uint256 price = L.price;
        if (toBuyer > price) revert AmountAbovePrice();

        uint256 toSeller = price - toBuyer;
        L.status = toBuyer == 0 ? Status.Released : Status.Refunded;
        if (toBuyer != 0) pending[L.buyer] += toBuyer;
        if (toSeller != 0) pending[L.seller] += toSeller;
        emit Resolved(id, toBuyer, toSeller);
    }

    // ------------------------------------------------------------------
    // Penarikan dan admin
    // ------------------------------------------------------------------

    /// @notice Satu-satunya jalan token keluar dari kontrak.
    function withdraw() external nonReentrant {
        uint256 amount = pending[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        pending[msg.sender] = 0;
        TOKEN.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Plafon harga absolut, penjaga salah ketik dan penipuan. Batas 150% face value dijaga
    /// aplikasi, karena kontrak tidak tahu face value. Plafon 0 menutup dana baru, sedangkan escrow
    /// yang sudah berjalan tetap bisa diselesaikan.
    function setPriceCap(uint256 priceCap_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setPriceCap(priceCap_);
    }

    // ------------------------------------------------------------------
    // Internal
    // ------------------------------------------------------------------

    function _verifyIntent(
        bytes32 id,
        address from,
        uint256 value,
        bytes32 authNonce,
        uint256 deadline,
        bytes calldata fundSig
    ) private view {
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(FUND_TYPEHASH, id, from, value, authNonce, deadline)));
        if (!SignatureChecker.isValidSignatureNow(from, digest, fundSig)) revert BadSignature();
    }

    function _pull(
        address from,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 authNonce,
        bytes calldata erc3009Sig
    ) private {
        uint256 before = TOKEN.balanceOf(address(this));
        IERC3009(address(TOKEN))
            .receiveWithAuthorization(from, address(this), value, validAfter, validBefore, authNonce, erc3009Sig);
        if (TOKEN.balanceOf(address(this)) - before < value) revert TransferMismatch();
    }

    function _setPriceCap(uint256 priceCap_) private {
        // price disimpan uint128, jadi plafon tidak boleh melebihinya
        if (priceCap_ > type(uint128).max) revert PriceZeroOrAboveCap();
        priceCap = priceCap_;
        emit PriceCapSet(priceCap_);
    }

    function _deadline(Listing storage L) private view returns (uint256) {
        return uint256(L.handoverAt) + disputeWindow;
    }
}
