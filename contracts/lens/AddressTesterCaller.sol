// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@uniswap/v3-periphery/contracts/base/PeripheryImmutableState.sol';
import '@uniswap/v2-core/contracts/interfaces/IUniswapV2Callee.sol';
import '@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol';
import '../libraries/UniswapV2Library.sol';
import '../interfaces/ISwapRouter02.sol';
import '../interfaces/ITokenValidator.sol';
import '../base/ImmutableState.sol';
import 'hardhat/console.sol';
import './IAddressTester.sol';

contract AddressTesterCaller {
    address tester;

    constructor(address _tester) {
        tester = _tester;
    }

    function validate() public returns (bool, bool) {
        address usdc = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

        console.log('Calling Valid');
        (bool success1, bytes memory data1) =
            tester.call(hex'207c64fb000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2');

        console.log('Calling with hidden Valid');
        (bool success2, bytes memory data2) =
            tester.call(hex'207c64fb00000000eeeeeeeeeeeeeeeec02aaa39b223fe8d0a0e5c4f27ead9083c756cc2');

        console.logBool(success1);
        console.logBool(success2);

        require(success1, '1 failed');
        require(success2, '2 failed');

        return (success1, success2);
    }
}
