// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {LummyEscrow} from "../src/LummyEscrow.sol";
import {LummyIntentFactory} from "../src/LummyIntentReceiver.sol";

/// @notice Deploys the factory for an escrow that already exists. ESCROW is required. Writes
/// deployments/intents-<chainId>.json, which `npm run chain:abi` copies into the web app.
contract DeployIntents is Script {
    function run() external returns (LummyIntentFactory factory) {
        LummyEscrow escrow = LummyEscrow(vm.envAddress("ESCROW"));

        vm.startBroadcast();
        factory = new LummyIntentFactory(escrow);
        vm.stopBroadcast();

        if (!vm.isContext(VmSafe.ForgeContext.ScriptBroadcast) && !vm.isContext(VmSafe.ForgeContext.ScriptResume)) {
            console.log("dry run, deployments/ not written");
            return factory;
        }

        string memory k = "intents";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeAddress(k, "escrow", address(escrow));
        string memory json = vm.serializeAddress(k, "factory", address(factory));
        string memory path =
            string.concat(vm.projectRoot(), "/deployments/intents-", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);

        console.log("factory:", address(factory));
        console.log("escrow :", address(escrow));
        console.log("written:", path);
    }
}
