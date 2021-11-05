// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.7.5;
pragma abicoder v2;

/// @title OracleSlippage interface
/// @notice Enables slippage checks against oracle prices
interface IOracleSlippage {
    /// @notice Ensures that the current (synthetic) tick over the path is no worse than
    /// `maximumTickDivergence` ticks away from the average as of `secondsAgo`
    /// @param path The path to fetch prices over
    /// @param maximumTickDivergence The maximum number of ticks that the price can degrade by
    /// @param secondsAgo The number of seconds ago to compute oracle prices against
    function checkOracleSlippage(
        bytes memory path,
        uint24 maximumTickDivergence,
        uint32 secondsAgo
    ) external view;
}
