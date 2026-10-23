// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ReentrancyGuardTransient (padanan untuk analisis Slither, tidak pernah di-deploy)
/// @notice Slither 0.11.6 gagal membangun IR untuk ReentrancyGuardTransient OpenZeppelin 5.7
/// (`using TransientSlot for *` pada tipe nilai buatan), lalu melewatkan SSA seluruh LummyEscrow. Profil
/// `slither` di foundry.toml memetakan import OpenZeppelin ke file ini supaya LummyEscrow terbaca penuh.
/// @dev Perilakunya sama dengan aslinya: slot transient yang sama, error yang sama, modifier yang sama,
/// cuma ditulis dengan `tload`/`tstore` langsung. Bytecode yang di-deploy tetap memakai file OpenZeppelin.
abstract contract ReentrancyGuardTransient {
    // keccak256(abi.encode(uint256(keccak256("openzeppelin.storage.ReentrancyGuard")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant REENTRANCY_GUARD_STORAGE =
        0x9b779b17422d0df92223018b32b4d1fa46e071723d6817e2486d003becc55f00;

    error ReentrancyGuardReentrantCall();

    modifier nonReentrant() {
        _nonReentrantBefore();
        _;
        _nonReentrantAfter();
    }

    modifier nonReentrantView() {
        _nonReentrantBeforeView();
        _;
    }

    function _nonReentrantBeforeView() private view {
        if (_reentrancyGuardEntered()) {
            revert ReentrancyGuardReentrantCall();
        }
    }

    function _nonReentrantBefore() private {
        _nonReentrantBeforeView();
        bytes32 slot = _reentrancyGuardStorageSlot();
        assembly ("memory-safe") {
            tstore(slot, 1)
        }
    }

    function _nonReentrantAfter() private {
        bytes32 slot = _reentrancyGuardStorageSlot();
        assembly ("memory-safe") {
            tstore(slot, 0)
        }
    }

    function _reentrancyGuardEntered() internal view returns (bool entered) {
        bytes32 slot = _reentrancyGuardStorageSlot();
        assembly ("memory-safe") {
            entered := tload(slot)
        }
    }

    function _reentrancyGuardStorageSlot() internal pure virtual returns (bytes32) {
        return REENTRANCY_GUARD_STORAGE;
    }
}
