// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;

import '@uniswap/v3-periphery/contracts/base/PeripheryImmutableState.sol';
import '@uniswap/v3-periphery/contracts/libraries/Path.sol';
import '@uniswap/v3-periphery/contracts/libraries/PoolAddress.sol';
import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';

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

    function oracleSlippage(bytes memory path, uint24 maximumTickDivergence) external view {
        require(path.numPools() > 0, 'Path must be valid');

        // running synthetic ticks
        int24 syntheticBlockStartingTick;
        int24 syntheticCurrentTick;

        (address tokenIn, address tokenOut, uint24 fee) = path.decodeFirstPool();
        bool lowerTicksAreWorse = tokenIn < tokenOut;
        address tokenOutNext;

        while (path.numPools() > 0) {
            address pool = PoolAddress.computeAddress(factory, PoolAddress.getPoolKey(tokenIn, tokenOut, fee));
            (int24 blockStartingTick, int24 currentTick) = getBlockStartingAndCurrentTick(pool);

            path = path.skipToken();
            (, tokenOutNext, fee) = path.decodeFirstPool();

            // chain ticks together
            bool add = tokenIn < tokenOut ? tokenOut < tokenOutNext : tokenOutNext < tokenIn;
            if (add) {
                syntheticBlockStartingTick += blockStartingTick;
                syntheticCurrentTick += currentTick;
            } else {
                syntheticBlockStartingTick -= blockStartingTick;
                syntheticCurrentTick -= currentTick;
            }

            tokenIn = tokenOut;
            tokenOut = tokenOutNext;
        }

        if (lowerTicksAreWorse) {
            require(
                syntheticCurrentTick >= syntheticBlockStartingTick ||
                    uint24(syntheticBlockStartingTick - syntheticCurrentTick) < maximumTickDivergence,
                'Divergence'
            );
        } else {
            require(
                syntheticCurrentTick <= syntheticBlockStartingTick ||
                    uint24(syntheticCurrentTick - syntheticBlockStartingTick) < maximumTickDivergence,
                'Divergence'
            );
        }
    }
}
