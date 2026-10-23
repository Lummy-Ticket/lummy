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

    function list(bytes32 id, uint256 price, bytes32 commit, uint40 eventEndsAt) external {
        escrow.createListing(id, price, commit, eventEndsAt);
    }

    function handover(bytes32 id, bytes32 handoverHash) external {
        escrow.markHandover(id, handoverHash);
    }

    function withdraw() external {
        escrow.withdraw();
    }

    function onTokenReceived() external {
        escrow.withdraw();
    }
}

/// @notice Token jahat untuk `fund`: begitu escrow menerima dana pembeli, token memanggil escrow lagi
/// dengan `reentry` (mis. `fund` listing lain) dan meneruskan revert-nya apa adanya. Sekali pakai.
contract FundHookToken is MockUSDC {
    address public hookEscrow;
    bytes public reentry;

    function arm(address escrow, bytes calldata data) external {
        hookEscrow = escrow;
        reentry = data;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (to == address(0) || to != hookEscrow || reentry.length == 0) return;

        bytes memory data = reentry;
        delete reentry;
        (bool ok, bytes memory ret) = hookEscrow.call(data);
        if (!ok) {
            assembly ("memory-safe") {
                revert(add(ret, 0x20), mload(ret))
            }
        }
    }
}

/// @notice Token yang menyerahkan kurang dari `value`, seperti token dengan potongan transfer: satu unit
/// dibakar di jalan.
contract ShortToken is MockUSDC {
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0) && value != 0) {
            super._update(from, address(0), 1);
            value -= 1;
        }
        super._update(from, to, value);
    }
}
