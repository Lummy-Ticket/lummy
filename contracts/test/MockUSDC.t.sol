// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// @notice Perilaku ERC-3009 yang diandalkan escrow, diuji langsung di token.
contract MockUSDCTest is Test {
    MockUSDC internal usdc;
    address internal from;
    uint256 internal key;
    address internal payee = makeAddr("payee");
    address internal attacker = makeAddr("attacker");

    function setUp() public {
        usdc = new MockUSDC();
        (from, key) = makeAddrAndKey("from");
        usdc.mint(from, 1_000e6);
    }

    function _auth(uint256 signer, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(
            abi.encode(usdc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(), from, to, value, validAfter, validBefore, nonce)
        );
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(signer, keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), structHash)));
        return abi.encodePacked(r, s, v);
    }

    function test_decimalsIsSix() public view {
        assertEq(usdc.decimals(), 6);
    }

    function test_receive_movesFunds() public {
        uint256 until = vm.getBlockTimestamp() + 1 hours;
        bytes memory sig = _auth(key, payee, 100e6, 0, until, "n");
        vm.prank(payee);
        usdc.receiveWithAuthorization(from, payee, 100e6, 0, until, "n", sig);
        assertEq(usdc.balanceOf(payee), 100e6);
        assertTrue(usdc.authorizationState(from, "n"));
    }

    /// Otorisasi untuk escrow tidak bisa dieksekusi pihak lain (anti front-run, docs/09).
    function test_receive_onlyPayeeCanExecute() public {
        uint256 until = vm.getBlockTimestamp() + 1 hours;
        bytes memory sig = _auth(key, payee, 100e6, 0, until, "n");
        vm.prank(attacker);
        vm.expectRevert(MockUSDC.CallerMustBePayee.selector);
        usdc.receiveWithAuthorization(from, payee, 100e6, 0, until, "n", sig);
    }

    function test_receive_replayRejected() public {
        uint256 until = vm.getBlockTimestamp() + 1 hours;
        bytes memory sig = _auth(key, payee, 100e6, 0, until, "n");
        vm.startPrank(payee);
        usdc.receiveWithAuthorization(from, payee, 100e6, 0, until, "n", sig);
        vm.expectRevert(MockUSDC.AuthUsed.selector);
        usdc.receiveWithAuthorization(from, payee, 100e6, 0, until, "n", sig);
        vm.stopPrank();
    }

    function test_receive_expiredRejected() public {
        uint256 until = vm.getBlockTimestamp() + 1 hours;
        bytes memory sig = _auth(key, payee, 100e6, 0, until, "n");
        vm.warp(until);
        vm.prank(payee);
        vm.expectRevert(MockUSDC.AuthorizationExpired.selector);
        usdc.receiveWithAuthorization(from, payee, 100e6, 0, until, "n", sig);
    }

    function test_receive_notYetValidRejected() public {
        uint256 after_ = vm.getBlockTimestamp() + 1 hours;
        bytes memory sig = _auth(key, payee, 100e6, after_, after_ + 1 hours, "n");
        vm.prank(payee);
        vm.expectRevert(MockUSDC.AuthorizationNotYetValid.selector);
        usdc.receiveWithAuthorization(from, payee, 100e6, after_, after_ + 1 hours, "n", sig);
    }

    function test_receive_wrongSignerRejected() public {
        (, uint256 otherKey) = makeAddrAndKey("other");
        uint256 until = vm.getBlockTimestamp() + 1 hours;
        bytes memory sig = _auth(otherKey, payee, 100e6, 0, until, "n");
        vm.prank(payee);
        vm.expectRevert(MockUSDC.InvalidSignature.selector);
        usdc.receiveWithAuthorization(from, payee, 100e6, 0, until, "n", sig);
    }

    function test_receive_vrsOverload() public {
        uint256 until = vm.getBlockTimestamp() + 1 hours;
        bytes32 structHash =
            keccak256(abi.encode(usdc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(), from, payee, 7e6, 0, until, bytes32("v")));
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(key, keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), structHash)));
        vm.prank(payee);
        usdc.receiveWithAuthorization(from, payee, 7e6, 0, until, bytes32("v"), v, r, s);
        assertEq(usdc.balanceOf(payee), 7e6);
    }
}
