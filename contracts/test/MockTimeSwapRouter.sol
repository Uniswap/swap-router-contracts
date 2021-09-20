// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.7.6;
pragma abicoder v2;

import '../SwapRouter02.sol';

contract MockTimeSwapRouter02 is SwapRouter02 {
    uint256 time;

    constructor(address _factory, address _WETH9) SwapRouter02(_factory, _WETH9) {}

    function _blockTimestamp() internal view override returns (uint256) {
        return time;
    }

    function setTime(uint256 _time) external {
        time = _time;
    }
}
