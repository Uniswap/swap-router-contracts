// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.7.5;
pragma abicoder v2;

/// @title MixedRouteQuoterV1 Interface
/// @notice Supports quoting the calculated amounts for exact input swaps. Is specialized for routes containing a mix of V2 and V3 liquidity.
/// @notice For each pool also tells you the number of initialized ticks crossed and the sqrt price of the pool after the swap.
/// @dev These functions are not marked view because they rely on calling non-view functions and reverting
/// to compute the result. They are also not gas efficient and should not be called on-chain.
interface IMixedRouteQuoterV1 {
    /// @notice Returns the amount out received for a given exact input swap without executing the swap
    /// @param path The path of the swap, i.e. each token pair and the pool fee
    /// @param amountIn The amount of the first token to swap
    /// @return amountOut The amount of the last token that would be received
    /// @return v3SqrtPriceX96AfterList List of the sqrt price after the swap for each v3 pool in the path, 0 for v2 pools
    /// @return v3InitializedTicksCrossedList List of the initialized ticks that the swap crossed for each v3 pool in the path, 0 for v2 pools
    /// @return v3SwapGasEstimate The estimate of the gas that the v3 swaps in the path consume
    function quoteExactInput(bytes memory path, uint256 amountIn)
        external
        returns (
            uint256 amountOut,
            uint160[] memory v3SqrtPriceX96AfterList,
            uint32[] memory v3InitializedTicksCrossedList,
            uint256 v3SwapGasEstimate
        );

    struct QuoteExactInputSingleV3Params {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
    }

    struct QuoteExactInputSingleV2Params {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
    }

    /// @notice Returns the amount out received for a given exact input but for a swap of a single pool
    /// @param params The params for the quote, encoded as `QuoteExactInputSingleParams`
    /// tokenIn The token being swapped in
    /// tokenOut The token being swapped out
    /// fee The fee of the token pool to consider for the pair
    /// amountIn The desired input amount
    /// sqrtPriceLimitX96 The price limit of the pool that cannot be exceeded by the swap
    /// @return amountOut The amount of `tokenOut` that would be received
    /// @return sqrtPriceX96After The sqrt price of the pool after the swap
    /// @return initializedTicksCrossed The number of initialized ticks that the swap crossed
    /// @return gasEstimate The estimate of the gas that the swap consumes
    function quoteExactInputSingleV3(QuoteExactInputSingleV3Params memory params)
        external
        returns (
            uint256 amountOut,
            uint160 sqrtPriceX96After,
            uint32 initializedTicksCrossed,
            uint256 gasEstimate
        );

    /// @notice Returns the amount out received for a given exact input but for a swap of a single V2 pool
    /// @param params The params for the quote, encoded as `QuoteExactInputSingleV2Params`
    /// tokenIn The token being swapped in
    /// tokenOut The token being swapped out
    /// amountIn The desired input amount
    /// @return amountOut The amount of `tokenOut` that would be received
    function quoteExactInputSingleV2(QuoteExactInputSingleV2Params memory params) external returns (uint256 amountOut);

    /// @dev ExactOutput swaps are not supported by this new Quoter which is specialized for supporting routes
    ///      crossing both V2 liquidity pairs and V3 pools.
    /// @deprecated quoteExactOutputSingle and exactOutput. Use QuoterV2 instead.
}
