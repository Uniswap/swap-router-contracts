// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

import './interfaces/ISwapRouter02.sol';
import './V3SwapRouter.sol';
import './base/PeripheryImmutableState.sol';
import './base/Multicall.sol';
import './base/SelfPermit.sol';
import './base/PeripheryValidation.sol';

/// @title Uniswap V2 and V3 Swap Router
contract SwapRouter02 is
    ISwapRouter02,
    V3SwapRouter,
    Multicall,
    SelfPermit,
    PeripheryValidation
{
    constructor(address _factory, address _WETH9) PeripheryImmutableState(_factory, _WETH9) {}
}
