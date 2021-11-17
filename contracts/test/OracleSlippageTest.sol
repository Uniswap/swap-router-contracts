// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

import '../base/OracleSlippage.sol';

contract OracleSlippageTest is OracleSlippage {
    mapping(address => mapping(address => mapping(uint24 => IUniswapV3Pool))) private pools;
    uint256 internal time;

    constructor(address _factory, address _WETH9) PeripheryImmutableState(_factory, _WETH9) {}

    function setTime(uint256 _time) external {
        time = _time;
    }

    function _blockTimestamp() internal view override returns (uint256) {
        return time;
    }

    function registerPool(
        IUniswapV3Pool pool,
        address tokenIn,
        address tokenOut,
        uint24 fee
    ) external {
        pools[tokenIn][tokenOut][fee] = pool;
        pools[tokenOut][tokenIn][fee] = pool;
    }

    function getPoolAddress(
        address tokenA,
        address tokenB,
        uint24 fee
    ) internal view override returns (IUniswapV3Pool pool) {
        pool = pools[tokenA][tokenB][fee];
    }

    function testGetBlockStartingAndCurrentTick(IUniswapV3Pool pool)
        external
        view
        returns (int24 blockStartingTick, int24 currentTick)
    {
        return getBlockStartingAndCurrentTick(pool);
    }

    function testGetSyntheticTicks(bytes memory path, uint32 secondsAgo)
        external
        view
        returns (int256 syntheticAverageTick, int256 syntheticCurrentTick)
    {
        return getSyntheticTicks(path, secondsAgo);
    }

    function testGetSyntheticTicks(
        bytes[] memory paths,
        uint128[] memory amounts,
        uint32 secondsAgo
    ) external view returns (int256 averageSyntheticAverageTick, int256 averageSyntheticCurrentTick) {
        return getSyntheticTicks(paths, amounts, secondsAgo);
    }
}
