// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {LummyEscrow} from "../../src/LummyEscrow.sol";
import {MockUSDC} from "../../src/MockUSDC.sol";

/// @notice Tanda tangan pembeli untuk `fund`: otorisasi ERC-3009 ke token dan niat beli EIP-712 ke
/// escrow. Dua domain terpisah, sama seperti di produksi (docs/09, gotcha kontrak).
abstract contract Signing is Test {
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    struct FundArgs {
        address from;
        uint256 value;
        uint256 validAfter;
        uint256 validBefore;
        bytes32 authNonce;
        bytes authSig;
        uint256 deadline;
        bytes fundSig;
    }

    function _signFund(LummyEscrow escrow, MockUSDC token, bytes32 id, uint256 value, uint256 key, bytes32 authNonce)
        internal
        view
        returns (FundArgs memory a)
    {
        a.from = vm.addr(key);
        a.value = value;
        a.validBefore = vm.getBlockTimestamp() + 1 hours;
        a.authNonce = authNonce;
        a.deadline = vm.getBlockTimestamp() + 1 hours;

        bytes32 authHash = keccak256(
            abi.encode(
                token.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                a.from,
                address(escrow),
                value,
                a.validAfter,
                a.validBefore,
                authNonce
            )
        );
        a.authSig = _sign(key, _digest(token.DOMAIN_SEPARATOR(), authHash));

        bytes32 fundHash = keccak256(abi.encode(escrow.FUND_TYPEHASH(), id, a.from, value, authNonce, a.deadline));
        a.fundSig = _sign(key, _digest(_domainOf(escrow), fundHash));
    }

    function _submit(LummyEscrow escrow, bytes32 id, FundArgs memory a) internal {
        escrow.fund(id, a.from, a.value, a.validAfter, a.validBefore, a.authNonce, a.authSig, a.deadline, a.fundSig);
    }

    function _domainOf(LummyEscrow escrow) internal view returns (bytes32) {
        (, string memory name, string memory version, uint256 chainId, address verifying,,) = escrow.eip712Domain();
        return
            keccak256(
                abi.encode(DOMAIN_TYPEHASH, keccak256(bytes(name)), keccak256(bytes(version)), chainId, verifying)
            );
    }

    function _digest(bytes32 domain, bytes32 structHash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domain, structHash));
    }

    function _sign(uint256 key, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }
}
