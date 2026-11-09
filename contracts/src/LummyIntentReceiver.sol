// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";
import {LummyEscrow} from "./LummyEscrow.sol";

/// @notice What one order commits to before anyone pays. The receiver's address is derived from these
/// values, so paying that address is agreeing to exactly these terms.
struct IntentOrder {
    /// @dev The listing in LummyEscrow this payment funds.
    bytes32 listingId;
    /// @dev Who the money goes to when the sale stands.
    address seller;
    /// @dev Exact price in token units.
    uint128 price;
    /// @dev The escrow window may not start before this time. A later end (a postponed show) is fine.
    uint40 eventEndsAt;
    /// @dev Where every refund, overpayment and late payment goes. Chosen by the buyer.
    address refundTo;
    /// @dev Until this time the money waits to fund the listing. From then on it can only go back.
    uint40 refundAfter;
}

/// @title LummyIntentReceiver
/// @notice The address a cross-chain payment lands on, one per order. NEAR Intents (1Click) delivers USDC
/// here from whatever chain and asset the buyer paid with, and this contract is the only way out of it.
/// @dev The money has two exits: into LummyEscrow for this order's listing, on the terms above, or to
/// `refundTo`. No key controls it: every function but `raiseDispute` is open to anyone, so the buyer can
/// finish or undo a payment if Lummy's backend is gone, and a leaked operator key cannot redirect a cent.
///
/// LummyEscrow itself is unchanged. To it this contract is an ordinary buyer with a contract wallet:
/// `fund` needs an ERC-3009 authorisation and a purchase intent from the buyer, and both are checked with
/// EIP-1271 for contract wallets (Circle's FiatToken v2.2 and OpenZeppelin's SignatureChecker). This
/// contract says yes to those two checks only while its own `fund` is running.
contract LummyIntentReceiver is IERC1271 {
    using SafeERC20 for IERC20;

    LummyEscrow public immutable ESCROW;
    IERC20 public immutable TOKEN;
    bytes32 public immutable LISTING_ID;
    address public immutable SELLER;
    uint128 public immutable PRICE;
    uint40 public immutable EVENT_ENDS_AT;
    address public immutable REFUND_TO;
    uint40 public immutable REFUND_AFTER;

    /// @dev True only inside `fund`, which calls nothing but the escrow, which calls nothing but the token.
    bool private signing;

    event Paid(bytes32 indexed listingId, uint256 price, uint256 returned);
    event Swept(address indexed to, uint256 amount);

    error ZeroAddress();
    error TooLate();
    error TooEarly();
    error NotListed(LummyEscrow.Status current);
    error TermsChanged();
    error NotPaid(uint256 balance, uint256 price);
    error NotBuyer();
    error NothingToSweep();

    constructor(LummyEscrow escrow, IERC20 token, IntentOrder memory order) {
        if (address(escrow) == address(0) || address(token) == address(0)) revert ZeroAddress();
        if (order.refundTo == address(0) || order.seller == address(0)) revert ZeroAddress();
        ESCROW = escrow;
        TOKEN = token;
        LISTING_ID = order.listingId;
        SELLER = order.seller;
        PRICE = order.price;
        EVENT_ENDS_AT = order.eventEndsAt;
        REFUND_TO = order.refundTo;
        REFUND_AFTER = order.refundAfter;
    }

    /// @notice Lock the payment in the escrow. Anyone may call it, since the money can only go to the
    /// listing the buyer agreed to, and anything above the price goes back at once.
    function fund() external {
        if (block.timestamp >= REFUND_AFTER) revert TooLate();
        // forge-lint: disable-next-line(unused-return)
        (address seller,, uint128 price,, uint40 eventEndsAt, LummyEscrow.Status status,,) = ESCROW.listings(LISTING_ID);
        if (status != LummyEscrow.Status.Listed) revert NotListed(status);
        if (seller != SELLER || price != PRICE || eventEndsAt < EVENT_ENDS_AT) revert TermsChanged();
        uint256 balance = TOKEN.balanceOf(address(this));
        if (balance < PRICE) revert NotPaid(balance, PRICE);

        signing = true;
        ESCROW.fund(
            LISTING_ID,
            address(this),
            PRICE,
            0,
            type(uint256).max,
            keccak256(abi.encode(address(this), LISTING_ID)),
            "",
            type(uint256).max,
            ""
        );
        signing = false;

        uint256 returned = balance - PRICE;
        // The escrow and the token, the only calls above, call nothing back but isValidSignature.
        // forge-lint: disable-next-line(reentrancy-events)
        emit Paid(LISTING_ID, PRICE, returned);
        if (returned != 0) TOKEN.safeTransfer(REFUND_TO, returned);
    }

    /// @notice Send what this contract holds to `refundTo`, collecting any refund the escrow owes it
    /// first. Anyone may call it. Until `REFUND_AFTER`, money that can still fund this listing stays put,
    /// so a stranger cannot undo a purchase that is about to go through.
    function sweep() external {
        // forge-lint: disable-next-line(unused-return)
        (, address buyer,,,, LummyEscrow.Status status,,) = ESCROW.listings(LISTING_ID);
        bool stillOpen = status == LummyEscrow.Status.None || status == LummyEscrow.Status.Listed;
        if (buyer != address(this) && stillOpen && block.timestamp < REFUND_AFTER) revert TooEarly();

        if (ESCROW.pending(address(this)) != 0) ESCROW.withdrawFor(address(this));
        uint256 amount = TOKEN.balanceOf(address(this));
        if (amount == 0) revert NothingToSweep();
        // forge-lint: disable-next-line(reentrancy-events)
        emit Swept(REFUND_TO, amount);
        TOKEN.safeTransfer(REFUND_TO, amount);
    }

    /// @notice The buyer opens a claim directly, from the refund address, without Lummy's backend.
    function raiseDispute() external {
        if (msg.sender != REFUND_TO) revert NotBuyer();
        ESCROW.raiseDispute(LISTING_ID);
    }

    /// @inheritdoc IERC1271
    /// @dev Valid only for the escrow and the token, and only inside `fund`, so nobody can use an empty
    /// signature to pull this contract's money through ERC-3009 at any other moment.
    function isValidSignature(bytes32, bytes calldata) external view returns (bytes4) {
        bool asked = msg.sender == address(ESCROW) || msg.sender == address(TOKEN);
        return signing && asked ? IERC1271.isValidSignature.selector : bytes4(0xffffffff);
    }
}

/// @title LummyIntentFactory
/// @notice Tells a buyer where to pay before anything exists on chain, and deploys that address when the
/// payment has landed. Anyone may deploy: the address fixes the terms, so deploying changes nothing.
contract LummyIntentFactory {
    LummyEscrow public immutable ESCROW;
    IERC20 public immutable TOKEN;

    event ReceiverDeployed(bytes32 indexed listingId, address indexed receiver, address indexed refundTo);

    constructor(LummyEscrow escrow) {
        ESCROW = escrow;
        TOKEN = escrow.TOKEN();
    }

    /// @notice The address to pay for this order. It holds money fine before it has any code.
    function receiverOf(IntentOrder calldata order) public view returns (address) {
        // The standard CREATE2 init code: creation code, then its abi-encoded constructor arguments.
        // forge-lint: disable-next-line(encode-packed-collision)
        bytes memory init = abi.encodePacked(type(LummyIntentReceiver).creationCode, abi.encode(ESCROW, TOKEN, order));
        return Create2.computeAddress(bytes32(0), keccak256(init));
    }

    /// @notice Deploy the receiver if it is not there yet.
    function deploy(IntentOrder calldata order) public returns (LummyIntentReceiver receiver) {
        address at = receiverOf(order);
        if (at.code.length != 0) return LummyIntentReceiver(at);
        receiver = new LummyIntentReceiver{salt: bytes32(0)}(ESCROW, TOKEN, order);
        // forge-lint: disable-next-line(reentrancy-events)
        emit ReceiverDeployed(order.listingId, address(receiver), order.refundTo);
    }

    /// @notice The payment landed: deploy the receiver and lock the money in the escrow, in one transaction.
    function deployAndFund(IntentOrder calldata order) external returns (LummyIntentReceiver receiver) {
        receiver = deploy(order);
        receiver.fund();
    }
}
