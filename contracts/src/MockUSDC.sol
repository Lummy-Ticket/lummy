// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {IERC3009} from "./interfaces/IERC3009.sol";

/// @title MockUSDC
/// @notice USDC tiruan untuk test lokal: 6 desimal dan ERC-3009 `receiveWithAuthorization`, meniru
/// FiatToken Circle. Testnet dan produksi memakai USDC asli Circle. Jangan deploy ke mainnet: siapa
/// pun bisa `mint`.
contract MockUSDC is ERC20, EIP712, IERC3009 {
    bytes32 public constant RECEIVE_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    /// @notice Nonce otorisasi yang sudah dipakai. Acak, bukan berurutan (sifat ERC-3009).
    mapping(address authorizer => mapping(bytes32 nonce => bool used)) public authorizationState;

    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);

    error CallerMustBePayee();
    error AuthorizationNotYetValid();
    error AuthorizationExpired();
    error AuthUsed();
    error InvalidSignature();

    constructor() ERC20("Mock USDC", "USDC") EIP712("Mock USDC", "2") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 value) external {
        _mint(to, value);
    }

    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external {
        _receive(from, to, value, validAfter, validBefore, nonce, signature);
    }

    /// @notice Overload v, r, s seperti FiatToken versi lama.
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        _receive(from, to, value, validAfter, validBefore, nonce, abi.encodePacked(r, s, v));
    }

    /// @dev `to == msg.sender` itu inti anti front-run: otorisasi untuk escrow cuma bisa dieksekusi
    /// escrow sendiri, jadi dana tidak bisa masuk tanpa tercatat di listing.
    function _receive(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes memory signature
    ) private {
        if (to != msg.sender) revert CallerMustBePayee();
        if (block.timestamp <= validAfter) revert AuthorizationNotYetValid();
        if (block.timestamp >= validBefore) revert AuthorizationExpired();
        if (authorizationState[from][nonce]) revert AuthUsed();

        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(RECEIVE_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce))
        );
        if (!SignatureChecker.isValidSignatureNow(from, digest, signature)) revert InvalidSignature();

        authorizationState[from][nonce] = true;
        // Panggilan luar sebelum baris ini cuma staticcall EIP-1271 di cek tanda tangan, tidak bisa reentrancy.
        // forge-lint: disable-next-line(reentrancy-events)
        emit AuthorizationUsed(from, nonce);
        _transfer(from, to, value);
    }
}
