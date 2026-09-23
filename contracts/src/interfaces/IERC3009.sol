// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Bagian ERC-3009 yang dipakai escrow. `receiveWithAuthorization` mewajibkan
/// `msg.sender == to`, jadi otorisasi pembeli untuk escrow cuma bisa dieksekusi escrow sendiri.
/// Versi `bytes signature` ada di FiatToken v2.2 Circle, dan mendukung wallet kontrak (EIP-1271).
interface IERC3009 {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external;
}
