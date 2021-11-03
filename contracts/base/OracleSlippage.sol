// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;

import '@uniswap/v3-periphery/contracts/base/PeripheryImmutableState.sol';
import '@uniswap/v3-periphery/contracts/libraries/Path.sol';
import '@uniswap/v3-periphery/contracts/libraries/PoolAddress.sol';
import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';

import '../libraries/OracleLibrary.sol';

abstract contract OracleSlippage is PeripheryImmutableState {
    using Path for bytes;

    // probably only temporary
    function getBlockStartingAndCurrentTick(address pool) internal view returns (int24, int24) {
        (, int24 currentTick, uint16 observationIndex, uint16 observationCardinality, , , ) =
            IUniswapV3Pool(pool).slot0();

        // 2 observations are needed to reliably calculate the block starting tick
        require(observationCardinality > 1, 'NEO');

        // If the latest observation occurred in the past, then no tick-changing trades have happened in this block
        // therefore the tick in `slot0` is the same as at the beginning of the current block.
        // We don't need to check if this observation is initialized - it is guaranteed to be.
        (uint32 observationTimestamp, int56 tickCumulative, , ) = IUniswapV3Pool(pool).observations(observationIndex);
        if (observationTimestamp != uint32(block.timestamp)) {
            return (currentTick, currentTick);
        }

        uint256 prevIndex = (uint256(observationIndex) + observationCardinality - 1) % observationCardinality;
        (uint32 prevObservationTimestamp, int56 prevTickCumulative, , bool prevInitialized) =
            IUniswapV3Pool(pool).observations(prevIndex);

        require(prevInitialized, 'ONI');

        uint32 delta = observationTimestamp - prevObservationTimestamp;
        int24 blockStartingTick = int24((tickCumulative - prevTickCumulative) / delta);

        return (blockStartingTick, currentTick);
    }

    function oracleSlippage(
        bytes memory path,
        uint24 maximumTickDivergence,
        uint32 secondsAgo
    ) external view {
        // running synthetic ticks
        int256 syntheticAverageTick;
        int256 syntheticCurrentTick;

        // this assumes the path is sorted in swap order
        (address tokenIn, address tokenOut, uint24 fee) = path.decodeFirstPool();
        // if tokenIn < tokenOut, then tokenIn is token0 of the first pool,
        // meaning the tick represents an x/tokenIn price.
        // so, the lower the x/tokenIn price gets, the worse of a price the swap will get
        bool lowerTicksAreWorse = tokenIn < tokenOut;

        // get the address of the first pool
        address pool = PoolAddress.computeAddress(factory, PoolAddress.getPoolKey(tokenIn, tokenOut, fee));

        // we optimize for the secondsAgo == 0 case, i.e. since the beginning of the block
        if (secondsAgo == 0) {
            (syntheticAverageTick, syntheticCurrentTick) = getBlockStartingAndCurrentTick(pool);
        } else {
            (syntheticAverageTick, ) = OracleLibrary.consult(pool, secondsAgo);
            (, syntheticCurrentTick, , , , , ) = IUniswapV3Pool(pool).slot0();
        }

        // address tokenOutNext;
        // if the path includes > 1 pool, then chain the prices
        path = path.skipToken();
        address tokenOutNext;
        int24 averageTick;
        int24 currentTick;
        while (path.numPools() > 0) {
            (, tokenOutNext, fee) = path.decodeFirstPool();
            pool = PoolAddress.computeAddress(factory, PoolAddress.getPoolKey(tokenOut, tokenOutNext, fee));

            // get the average and current ticks in the current pool
            if (secondsAgo == 0) {
                (averageTick, currentTick) = getBlockStartingAndCurrentTick(pool);
            } else {
                (averageTick, ) = OracleLibrary.consult(pool, secondsAgo);
                (, currentTick, , , , , ) = IUniswapV3Pool(pool).slot0();
            }

            // chain ticks together
            bool add = tokenIn < tokenOut ? tokenOut < tokenOutNext : tokenOutNext < tokenIn;
            if (add) {
                syntheticAverageTick += averageTick;
                syntheticCurrentTick += currentTick;
            } else {
                syntheticAverageTick -= averageTick;
                syntheticCurrentTick -= currentTick;
            }

            tokenIn = tokenOut;
            tokenOut = tokenOutNext;
            path = path.skipToken();
        }

        if (lowerTicksAreWorse) {
            require(
                syntheticCurrentTick >= syntheticAverageTick ||
                    syntheticAverageTick - syntheticCurrentTick < maximumTickDivergence,
                'Divergence'
            );
        } else {
            require(
                syntheticCurrentTick <= syntheticAverageTick ||
                    syntheticCurrentTick - syntheticAverageTick < maximumTickDivergence,
                'Divergence'
            );
        }
    }
}
