// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {LummyLedger} from "../src/LummyLedger.sol";

/// @notice Deploy LummyLedger, buku besar publik untuk pesanan yang dibayar lewat QRIS. Parameter lewat env:
///   ADMIN, OPERATOR    wajib (operator sama dengan escrow: satu kunci panas backend)
///   LEDGER_WINDOW      detik, default 172800 (48 jam). Sama dengan aturan pesanan QRIS di aplikasi,
///                      juga di testnet, supaya catatan dan database tidak pernah beda batas.
///   DEPLOY_NAME        nama berkas hasil, default <chainId>
/// Hasilnya ditulis ke deployments/ledger-<DEPLOY_NAME>.json, lalu `npm run chain:abi` di web menyalinnya.
contract DeployLedger is Script {
    uint256 internal constant ARBITRUM_ONE = 42_161;
    uint256 internal constant PROD_WINDOW = 48 hours;

    function run() external returns (LummyLedger ledger) {
        address admin = vm.envAddress("ADMIN");
        address operator = vm.envAddress("OPERATOR");
        uint256 window = vm.envOr("LEDGER_WINDOW", PROD_WINDOW);
        if (block.chainid == ARBITRUM_ONE) {
            require(window == PROD_WINDOW, "DeployLedger: window produksi wajib 48 jam");
        }

        vm.startBroadcast();
        ledger = new LummyLedger(admin, operator, SafeCast.toUint64(window));
        vm.stopBroadcast();

        // Simulasi (dry run) tidak menulis apa pun: berkas ini dibaca aplikasi sebagai bukti kontrak ada.
        if (!vm.isContext(VmSafe.ForgeContext.ScriptBroadcast) && !vm.isContext(VmSafe.ForgeContext.ScriptResume)) {
            console.log("dry run, deployments/ tidak ditulis");
            return ledger;
        }

        string memory k = "ledger";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeAddress(k, "ledger", address(ledger));
        vm.serializeAddress(k, "admin", admin);
        vm.serializeAddress(k, "operator", operator);
        string memory json = vm.serializeUint(k, "disputeWindow", window);
        string memory name = vm.envOr("DEPLOY_NAME", vm.toString(block.chainid));
        string memory path = string.concat(vm.projectRoot(), "/deployments/ledger-", name, ".json");
        vm.writeJson(json, path);

        console.log("ledger :", address(ledger));
        console.log("window :", window);
        console.log("tulis  :", path);
    }
}
