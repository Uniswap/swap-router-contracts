// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;

import "forge-std/console2.sol";
import "forge-std/Script.sol";
import {MixedRouteQuoterV1} from "contracts/lens/MixedRouteQuoterV1.sol";

contract DeployMixedRouteQuoterV1 is Script {
    address constant V3_FACTORY = 0x33128a8fC17869897dcE68Ed026d694621f6FDfD;
    address constant V2_FACTORY = 0x8909dc15e40173ff4699343b6eb8132c65e18ec6;
    address constant WETH9 = 0x4200000000000000000000000000000000000006;

    function setUp() public {}

    function run() public returns (MixedRouteQuoterV1 mixedRouteQuoterV1) {
        vm.startBroadcast();

        mixedRouteQuoterV1 = new MixedRouteQuoterV1{salt: 0x00}(V3_FACTORY, V2_FACTORY, WETH9);
        console2.log("MixedRouteQuoterV1 deployed at", address(mixedRouteQuoterV1));

        vm.stopBroadcast();
    }
}