// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {LummyEscrow} from "../src/LummyEscrow.sol";
import {IntentOrder, LummyIntentFactory, LummyIntentReceiver} from "../src/LummyIntentReceiver.sol";

/// @notice The one thing a mock cannot prove: Circle's real USDC on Arbitrum One accepts this contract
/// wallet through EIP-1271. Runs against a fork, and is skipped unless RUN_FORK=1, so `forge test` needs
/// no network:  RUN_FORK=1 forge test --match-contract Fork
contract LummyIntentReceiverForkTest is Test {
    IERC20 internal constant USDC = IERC20(0xaf88d065e77c8cC2239327C5EDb3A432268e5831);
    uint256 internal constant PRICE = 9_500_000;
    bytes32 internal constant ID = keccak256("fork-hold");

    LummyEscrow internal escrow;
    LummyIntentFactory internal factory;
    address internal operator = makeAddr("operator");
    address internal seller = makeAddr("seller");
    address internal refundTo = makeAddr("refundTo");

    modifier onFork() {
        if (!vm.envOr("RUN_FORK", false)) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(vm.rpcUrl("arbitrum_one"));
        escrow = new LummyEscrow(USDC, makeAddr("admin"), operator, 25e6, 48 hours);
        factory = new LummyIntentFactory(escrow);
        _;
    }

    function _order() internal view returns (IntentOrder memory) {
        uint40 at = uint40(block.timestamp);
        // forge-lint: disable-next-line(unsafe-typecast)
        return IntentOrder(ID, seller, uint128(PRICE), at + 7 days, refundTo, at + 1 hours);
    }

    function test_realUsdc_paysIntoTheEscrow_andBackOut() public onFork {
        IntentOrder memory o = _order();
        address at = factory.receiverOf(o);
        deal(address(USDC), at, PRICE + 1_000_000);

        vm.prank(operator);
        escrow.createListingFor(seller, ID, PRICE, keccak256("commit"), o.eventEndsAt);
        LummyIntentReceiver r = factory.deployAndFund(o);

        assertEq(USDC.balanceOf(address(escrow)), PRICE, "locked");
        assertEq(USDC.balanceOf(refundTo), 1_000_000, "overpayment back");
        (, address buyer,,,, LummyEscrow.Status status,,) = escrow.listings(ID);
        assertEq(buyer, address(r));
        assertEq(uint8(status), uint8(LummyEscrow.Status.Funded));

        vm.prank(operator);
        escrow.refund(ID);
        r.sweep();
        assertEq(USDC.balanceOf(refundTo), PRICE + 1_000_000, "refund reached the buyer");
        assertEq(USDC.balanceOf(address(escrow)), 0, "nothing left");
    }

    function test_realUsdc_refusesAnEmptySignatureOutsideFund() public onFork {
        IntentOrder memory o = _order();
        address at = factory.receiverOf(o);
        deal(address(USDC), at, PRICE);
        factory.deploy(o);

        bytes memory pull = abi.encodeWithSignature(
            "receiveWithAuthorization(address,address,uint256,uint256,uint256,bytes32,bytes)",
            at,
            address(this),
            PRICE,
            uint256(0),
            type(uint256).max,
            keccak256("x"),
            bytes("")
        );
        // solhint-disable-next-line avoid-low-level-calls
        (bool ok,) = address(USDC).call(pull);
        assertFalse(ok, "an empty signature must not move the money");
        assertEq(USDC.balanceOf(at), PRICE);
    }
}
