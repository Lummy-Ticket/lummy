// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {LummyEscrow} from "../src/LummyEscrow.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// @notice Deploy LummyEscrow, plus MockUSDC kalau `TOKEN` tidak diset. Parameter lewat env:
///   ADMIN, OPERATOR    wajib
///   TOKEN              tidak diset = deploy MockUSDC (lokal dan demo testnet)
///   PRICE_CAP          default 5.000 USDC (6 desimal)
///   DISPUTE_WINDOW     detik, default 600 (10 menit, demo). Produksi wajib 172800.
/// Hasilnya ditulis ke deployments/<chainId>.json, lalu `npm run chain:abi` di web menyalinnya.
contract Deploy is Script {
    uint256 internal constant ARBITRUM_ONE = 42_161;
    uint256 internal constant PROD_WINDOW = 48 hours;

    function run() external returns (LummyEscrow escrow, address token) {
        address admin = vm.envAddress("ADMIN");
        address operator = vm.envAddress("OPERATOR");
        uint256 priceCap = vm.envOr("PRICE_CAP", uint256(5_000e6));
        uint256 disputeWindow = vm.envOr("DISPUTE_WINDOW", uint256(10 minutes));
        token = vm.envOr("TOKEN", address(0));
        bool mock = token == address(0);

        // Produksi: window persis 48 jam dan USDC asli (keputusan D).
        if (block.chainid == ARBITRUM_ONE) {
            require(disputeWindow == PROD_WINDOW, "Deploy: window produksi wajib 48 jam");
            require(!mock, "Deploy: produksi wajib USDC asli, bukan MockUSDC");
        }

        vm.startBroadcast();
        if (mock) token = address(new MockUSDC());
        escrow = new LummyEscrow(IERC20(token), admin, operator, priceCap, SafeCast.toUint64(disputeWindow));
        vm.stopBroadcast();

        // Simulasi (dry run) tidak menulis apa pun: berkas ini dibaca aplikasi sebagai bukti kontrak ada.
        if (!vm.isContext(VmSafe.ForgeContext.ScriptBroadcast) && !vm.isContext(VmSafe.ForgeContext.ScriptResume)) {
            console.log("dry run, deployments/ tidak ditulis");
            return (escrow, token);
        }

        string memory k = "deployment";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeAddress(k, "escrow", address(escrow));
        vm.serializeAddress(k, "token", token);
        vm.serializeBool(k, "mockToken", mock);
        vm.serializeAddress(k, "admin", admin);
        vm.serializeAddress(k, "operator", operator);
        vm.serializeUint(k, "priceCap", priceCap);
        string memory json = vm.serializeUint(k, "disputeWindow", disputeWindow);
        string memory path = string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);

        console.log("escrow :", address(escrow));
        console.log("token  :", token);
        console.log("window :", disputeWindow);
        console.log("tulis  :", path);
    }
}
