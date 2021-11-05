// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;

import '../interfaces/IOracleSlippage.sol';

import '@uniswap/v3-periphery/contracts/base/PeripheryImmutableState.sol';
import '@uniswap/v3-periphery/contracts/libraries/Path.sol';
import '@uniswap/v3-periphery/contracts/libraries/PoolAddress.sol';
import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';
import '@uniswap/v3-periphery/contracts/libraries/OracleLibrary.sol';

abstract contract OracleSlippage is IOracleSlippage, PeripheryImmutableState {
    using Path for bytes;

    function getBlockStartingAndCurrentTick(address pool)
        private
        view
        returns (int24 blockStartingTick, int24 currentTick)
    {
        uint16 observationIndex;
        uint16 observationCardinality;
        (, currentTick, observationIndex, observationCardinality, , , ) = IUniswapV3Pool(pool).slot0();

        // 2 observations are needed to reliably calculate the block starting tick
        require(observationCardinality > 1, 'NEO');

        // If the latest observation occurred in the past, then no tick-changing trades have happened in this block
        // therefore the tick in `slot0` is the same as at the beginning of the current block.
        // We don't need to check if this observation is initialized - it is guaranteed to be.
        (uint32 observationTimestamp, int56 tickCumulative, , ) = IUniswapV3Pool(pool).observations(observationIndex);
        if (observationTimestamp != uint32(block.timestamp)) {
            blockStartingTick = currentTick;
        } else {
            uint256 prevIndex = (uint256(observationIndex) + observationCardinality - 1) % observationCardinality;
            (uint32 prevObservationTimestamp, int56 prevTickCumulative, , bool prevInitialized) =
                IUniswapV3Pool(pool).observations(prevIndex);

            require(prevInitialized, 'ONI');

            uint32 delta = observationTimestamp - prevObservationTimestamp;
            blockStartingTick = int24((tickCumulative - prevTickCumulative) / delta);
        }
    }

    /// @inheritdoc IOracleSlippage
    function checkOracleSlippage(
        bytes memory path,
        uint24 maximumTickDivergence,
        uint32 secondsAgo
    ) external view override {
        // running synthetic ticks and a flag indicating the direction of the price
        int256 syntheticAverageTick;
        int256 syntheticCurrentTick;
        bool lowerTicksAreWorse;

        uint256 numPools = path.numPools();
        address previousTokenIn;
        for (uint256 i = 0; i < numPools; i++) {
            bool first = i == 0;
            bool last = i == numPools - 1;

            // this assumes the path is sorted in swap order
            (address tokenIn, address tokenOut, uint24 fee) = path.decodeFirstPool();
            address pool = PoolAddress.computeAddress(factory, PoolAddress.getPoolKey(tokenIn, tokenOut, fee));

            // get the average and current ticks for the current pool
            int256 averageTick;
            int256 currentTick;
            if (secondsAgo == 0) {
                // we optimize for the secondsAgo == 0 case, i.e. since the beginning of the block
                (averageTick, currentTick) = getBlockStartingAndCurrentTick(pool);
            } else {
                (averageTick, ) = OracleLibrary.consult(pool, secondsAgo);
                (, currentTick, , , , , ) = IUniswapV3Pool(pool).slot0();
            }

            if (!last) {
                path = path.skipToken();
                previousTokenIn = tokenIn;
            } else {
                // if we're here, this is the last pool in the path, meaning tokenOut represents the
                // destination token. so, if tokenIn < tokenOut, then tokenIn is token0 of the last pool,
                // meaning the current running ticks are going to represent tokenOut/tokenIn prices.
                // so, the lower these prices gets, the worse of a price the swap will get
                lowerTicksAreWorse = tokenIn < tokenOut;
            }

            // accumulate the ticks derived from the current pool into the running synthetic ticks
            bool add = first || (previousTokenIn < tokenIn ? tokenIn < tokenOut : tokenOut < tokenIn);
            if (add) {
                syntheticAverageTick += averageTick;
                syntheticCurrentTick += currentTick;
            } else {
                syntheticAverageTick -= averageTick;
                syntheticCurrentTick -= currentTick;
            }
        }

        if (lowerTicksAreWorse) {
            require(syntheticAverageTick - syntheticCurrentTick < maximumTickDivergence, 'Divergence');
        } else {
            require(syntheticCurrentTick - syntheticAverageTick < maximumTickDivergence, 'Divergence');
        }
    }
}
