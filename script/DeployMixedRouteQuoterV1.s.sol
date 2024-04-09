// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;

import 'forge-std/console2.sol';
import 'forge-std/Script.sol';
import {MixedRouteQuoterV1} from 'contracts/lens/MixedRouteQuoterV1.sol';

contract DeployMixedRouteQuoterV1 is Script {
    function setUp() public {}

    function run() public returns (MixedRouteQuoterV1 mixedRouteQuoterV1) {
        address V3_FACTORY = vm.envAddress('FOUNDRY_MIXEDROUTE_QUOTER_DEPLOY_V3_FACTORY');
        address V2_FACTORY = vm.envAddress('FOUNDRY_MIXEDROUTE_QUOTER_DEPLOY_V2_FACTORY');
        address WETH9 = vm.envAddress('FOUNDRY_MIXEDROUTE_QUOTER_DEPLOY_WETH9');

        vm.startBroadcast();

        mixedRouteQuoterV1 = new MixedRouteQuoterV1{salt: 0x00}(V3_FACTORY, V2_FACTORY, WETH9);
        console2.log('MixedRouteQuoterV1 deployed at', address(mixedRouteQuoterV1));

        vm.stopBroadcast();
    }
}
