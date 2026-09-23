// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {LummyEscrow} from "../../src/LummyEscrow.sol";
import {MockUSDC} from "../../src/MockUSDC.sol";

/// @notice Token jahat untuk test reentrancy: memanggil balik satu penerima saat menerima transfer.
contract HookToken is MockUSDC {
    address public hookTarget;

    function setHookTarget(address target) external {
        hookTarget = target;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (to != address(0) && to == hookTarget) Reenterer(to).onTokenReceived();
    }
}

/// @notice Seller jahat: begitu dana dari `withdraw` masuk, dia mencoba `withdraw` lagi.
contract Reenterer {
    LummyEscrow internal escrow;

    function setEscrow(LummyEscrow e) external {
        escrow = e;
    }

    function list(bytes32 id, uint256 price, bytes32 commit) external {
        escrow.createListing(id, price, commit);
    }

    function handover(bytes32 id) external {
        escrow.markHandover(id);
    }

    function withdraw() external {
        escrow.withdraw();
    }

    function onTokenReceived() external {
        escrow.withdraw();
    }
}
