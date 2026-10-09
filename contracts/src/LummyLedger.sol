// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

/// @title LummyLedger
/// @notice Catatan publik escrow untuk pesanan yang dibayar di luar chain (QRIS lewat Xendit). Uangnya
/// dipegang penyedia pembayaran, bukan kontrak ini. Yang dijaga kontrak adalah catatannya: tiap langkah
/// tercatat sekali, berurutan, dengan waktu blok, dan tidak bisa diubah atau dihapus. Kalau yang terjadi
/// pada uangnya berbeda dari catatan ini, catatan inilah buktinya.
/// @dev Aturan waktunya sama dengan LummyEscrow (keputusan G): pencairan baru bisa dicatat setelah window
/// lewat, siapa pun boleh mencatatnya (jadi Lummy tidak bisa menahannya), dan setelah window lewat tanpa
/// sengketa, refund, sengketa baru, dan perubahan jadwal ditolak. Satu pembayaran cuma bisa menjadi satu
/// pesanan, dan satu tiket cuma bisa terjual sekali (keputusan A). Tidak ada data pribadi: pihak-pihaknya
/// tidak dicatat, nominal dalam rupiah, pembayaran dan tiket cuma sebagai hash. Window dihitung dari
/// selesainya acara saja, karena pembeli menerima tiket dan surat kuasa begitu pembayarannya masuk.
/// Keputusan desainnya di docs/09-technical-design.md §7.
contract LummyLedger is AccessControl {
    /// @notice Kunci panas backend: mencatat pembayaran, sengketa, putusan, refund, dan jadwal acara.
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    /// @notice Batas bawah window sengketa, penjaga salah ketik saat deploy.
    uint64 public constant MIN_DISPUTE_WINDOW = 5 minutes;

    /// @dev Urutan ini load-bearing: viem membaca index yang sama (web/src/lib/chain/ledger.ts).
    enum Status {
        None,
        Open,
        Released,
        Refunded
    }

    /// @notice Alasan refund tanpa sengketa. Refund hasil sengketa dicatat lewat `resolveDispute`.
    enum RefundReason {
        Other,
        EventCancelled,
        EventPostponed
    }

    struct Order {
        /// @dev Rupiah yang ditahan untuk penjual, tanpa biaya layanan dan meterai.
        uint128 amount;
        uint40 openedAt;
        uint40 eventEndsAt;
        Status status;
        bool disputed;
    }

    uint64 public immutable disputeWindow;

    mapping(bytes32 id => Order) public orders;
    mapping(bytes32 paymentRef => bool) public paymentUsed;
    mapping(bytes32 commit => bool) public commitUsed;

    event Opened(
        bytes32 indexed id,
        uint256 amount,
        bytes32 paymentRef,
        bytes32 ticketCommit,
        bytes32 handoverHash,
        uint256 eventEndsAt,
        uint256 disputeDeadline
    );
    event EventPostponed(bytes32 indexed id, uint256 eventEndsAt, uint256 disputeDeadline);
    event DisputeRaised(bytes32 indexed id);
    event Released(bytes32 indexed id, uint256 amount);
    event Refunded(bytes32 indexed id, uint256 amount, RefundReason reason);
    event Resolved(bytes32 indexed id, uint256 toBuyer, uint256 toSeller);

    error ZeroAddress();
    error WindowTooShort();
    error BadStatus(Status current);
    error ZeroAmount();
    error NoPaymentRef();
    error PaymentAlreadyUsed();
    error CommitAlreadyUsed();
    error NoHandoverProof();
    error NoEventEnd();
    error CannotMoveEventEarlier();
    error WindowNotElapsed();
    error WindowClosed();
    error AlreadyDisputed();
    error IsDisputed();
    error NotDisputed();
    error AmountAbovePrice();

    constructor(address admin, address operator, uint64 disputeWindow_) {
        if (admin == address(0) || operator == address(0)) revert ZeroAddress();
        if (disputeWindow_ < MIN_DISPUTE_WINDOW) revert WindowTooShort();
        disputeWindow = disputeWindow_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, operator);
    }

    // ------------------------------------------------------------------
    // Pembayaran
    // ------------------------------------------------------------------

    /// @notice Pembayaran masuk dan tiketnya diserahkan: `amount` rupiah ditahan untuk penjual sampai
    /// window lewat. `paymentRef` = hash nomor pembayaran di penyedia, `ticketCommit` = komitmen set
    /// barcode tiket (nol untuk tiket contoh tanpa file), `handoverHash` = hash paket serah terima.
    function open(
        bytes32 id,
        uint256 amount,
        bytes32 paymentRef,
        bytes32 ticketCommit,
        bytes32 handoverHash,
        uint40 eventEndsAt
    ) external onlyRole(OPERATOR_ROLE) {
        Order storage O = orders[id];
        if (O.status != Status.None) revert BadStatus(O.status);
        if (amount == 0) revert ZeroAmount();
        if (paymentRef == bytes32(0)) revert NoPaymentRef();
        if (handoverHash == bytes32(0)) revert NoHandoverProof();
        if (eventEndsAt == 0) revert NoEventEnd();
        if (paymentUsed[paymentRef]) revert PaymentAlreadyUsed();
        if (ticketCommit != bytes32(0)) {
            if (commitUsed[ticketCommit]) revert CommitAlreadyUsed();
            commitUsed[ticketCommit] = true;
        }

        paymentUsed[paymentRef] = true;
        O.amount = SafeCast.toUint128(amount);
        O.openedAt = SafeCast.toUint40(block.timestamp);
        O.eventEndsAt = eventEndsAt;
        O.status = Status.Open;
        emit Opened(id, amount, paymentRef, ticketCommit, handoverHash, eventEndsAt, _deadline(O));
    }

    // ------------------------------------------------------------------
    // Jadwal dan sengketa
    // ------------------------------------------------------------------

    /// @notice Acara diundur. Waktu selesai cuma boleh dimundurkan, jadi kunci operator yang bocor bisa
    /// menunda pencatatan pencairan tapi tidak bisa mempercepatnya.
    function postponeEvent(bytes32 id, uint40 newEventEndsAt) external onlyRole(OPERATOR_ROLE) {
        Order storage O = orders[id];
        if (O.status != Status.Open) revert BadStatus(O.status);
        if (_windowClosed(O)) revert WindowClosed();
        if (newEventEndsAt <= O.eventEndsAt) revert CannotMoveEventEarlier();

        O.eventEndsAt = newEventEndsAt;
        emit EventPostponed(id, newEventEndsAt, _deadline(O));
    }

    /// @notice Pembeli mengajukan klaim, dicatat operator atas namanya. Boleh sampai tepat di batas window.
    function raiseDispute(bytes32 id) external onlyRole(OPERATOR_ROLE) {
        Order storage O = orders[id];
        if (O.status != Status.Open) revert BadStatus(O.status);
        if (O.disputed) revert AlreadyDisputed();
        if (_windowClosed(O)) revert WindowClosed();

        O.disputed = true;
        emit DisputeRaised(id);
    }

    // ------------------------------------------------------------------
    // Penyelesaian
    // ------------------------------------------------------------------

    /// @notice Catat pencairan ke penjual setelah window lewat tanpa sengketa. Siapa pun boleh memanggil,
    /// jadi kalau Lummy diam, penjual sendiri bisa membuat catatan bahwa uangnya sudah jadi haknya.
    function release(bytes32 id) external {
        Order storage O = orders[id];
        if (O.status != Status.Open) revert BadStatus(O.status);
        if (O.disputed) revert IsDisputed();
        if (block.timestamp <= _deadline(O)) revert WindowNotElapsed();

        O.status = Status.Released;
        emit Released(id, O.amount);
    }

    /// @notice Refund penuh ke pembeli tanpa sengketa, selama uangnya belum jadi hak penjual.
    function refund(bytes32 id, RefundReason reason) external onlyRole(OPERATOR_ROLE) {
        Order storage O = orders[id];
        if (O.status != Status.Open) revert BadStatus(O.status);
        if (_windowClosed(O)) revert WindowClosed();

        O.status = Status.Refunded;
        emit Refunded(id, O.amount, reason);
    }

    /// @notice Putusan klaim: pembeli dapat `toBuyer`, penjual dapat sisanya. Cuma pembagian di antara
    /// keduanya yang bisa dicatat, tidak pernah lebih dari yang ditahan (keputusan C).
    function resolveDispute(bytes32 id, uint256 toBuyer) external onlyRole(OPERATOR_ROLE) {
        Order storage O = orders[id];
        if (O.status != Status.Open) revert BadStatus(O.status);
        if (!O.disputed) revert NotDisputed();
        uint256 amount = O.amount;
        if (toBuyer > amount) revert AmountAbovePrice();

        O.status = toBuyer == 0 ? Status.Released : Status.Refunded;
        emit Resolved(id, toBuyer, amount - toBuyer);
    }

    // ------------------------------------------------------------------
    // Baca
    // ------------------------------------------------------------------

    /// @notice Batas window sengketa (unix detik): `disputeWindow` setelah acara selesai. Nol kalau belum ada.
    function deadlineOf(bytes32 id) external view returns (uint256) {
        Order storage O = orders[id];
        return O.status == Status.None ? 0 : _deadline(O);
    }

    // ------------------------------------------------------------------
    // Internal
    // ------------------------------------------------------------------

    function _deadline(Order storage O) private view returns (uint256) {
        return uint256(O.eventEndsAt) + disputeWindow;
    }

    /// @dev Window lewat tanpa sengketa: uangnya sudah hak penjual, dan cuma `release` yang tersisa.
    function _windowClosed(Order storage O) private view returns (bool) {
        return !O.disputed && block.timestamp > _deadline(O);
    }
}
