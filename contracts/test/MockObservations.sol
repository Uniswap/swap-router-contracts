// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.7.6;

import '@uniswap/v3-core/contracts/libraries/Oracle.sol';

contract MockObservations {
    using Oracle for Oracle.Observation[65535];

    // slot0
    int24 private slot0Tick;
    uint16 private slot0ObservationCardinality;
    uint16 private slot0ObservationIndex;

    // observations
    Oracle.Observation[65535] public observations;

    // block timestamps always monotonic increasing from 0, cumulative ticks are calculated automatically
    constructor(
        uint32[3] memory blockTimestamps,
        int24[3] memory ticks,
        bool mockLowObservationCardinality
    ) {
        require(blockTimestamps[0] == 0, '0');
        require(blockTimestamps[1] > 0, '1');
        require(blockTimestamps[2] > blockTimestamps[1], '2');

        int56 tickCumulative = 0;
        for (uint256 i = 0; i < blockTimestamps.length; i++) {
            if (i != 0) {
                int24 tick = ticks[i - 1];
                uint32 delta = blockTimestamps[i] - blockTimestamps[i - 1];
                tickCumulative += int56(tick) * delta;
            }
            observations[i] = Oracle.Observation({
                blockTimestamp: blockTimestamps[i],
                tickCumulative: tickCumulative,
                secondsPerLiquidityCumulativeX128: uint160(i),
                initialized: true
            });
        }
        slot0Tick = ticks[2];
        slot0ObservationCardinality = mockLowObservationCardinality ? 1 : 3;
        slot0ObservationIndex = 2;
    }

    function slot0()
        external
        view
        returns (
            uint160,
            int24,
            uint16,
            uint16,
            uint16,
            uint8,
            bool
        )
    {
        return (0, slot0Tick, slot0ObservationIndex, slot0ObservationCardinality, 0, 0, false);
    }

    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s)
    {
        return
            observations.observe(
                observations[2].blockTimestamp,
                secondsAgos,
                slot0Tick,
                slot0ObservationIndex,
                0,
                slot0ObservationCardinality
            );
    }
}
