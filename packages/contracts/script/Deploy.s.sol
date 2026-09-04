// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {RendezvousResolver} from "../src/RendezvousResolver.sol";

/// @dev GATEWAY_URL=... GATEWAY_SIGNER=0x... forge script script/Deploy.s.sol --rpc-url sepolia --broadcast --verify
contract Deploy is Script {
    function run() external {
        string[] memory urls = new string[](1);
        urls[0] = vm.envString("GATEWAY_URL");
        address[] memory signers = new address[](1);
        signers[0] = vm.envAddress("GATEWAY_SIGNER");

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        RendezvousResolver r = new RendezvousResolver(urls, signers);
        vm.stopBroadcast();

        console.log("RendezvousResolver:", address(r));
        console.log("gateway url:", urls[0]);
        console.log("signer:", signers[0]);
    }
}
