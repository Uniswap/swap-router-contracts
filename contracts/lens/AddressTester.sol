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

contract AddressTester is IAddressTester {
    constructor() {}

    function validate(address _addr) override public {
        bytes32 a;
        bytes32 b;
        assembly {
            a := calldataload(4)
        }

        console.logBytes32(a);

        address addr = _addr;
        bytes32 c;
        assembly {
            let ptr := mload(0x40)
            c := mload(sub(ptr, 32))
        }
        console.logBytes32(c);
    }
}
