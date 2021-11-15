// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.7.5;
pragma abicoder v2;

/// @title Router token swapping functionality
/// @notice Functions for swapping tokens via Uniswap V2
interface IV2SwapRouter {
    struct ExactInputV2Params {
        uint256 amountIn;
        uint256 amountOutMinimum;
        address[] path;
    }

    struct ExactOutputV2Params {
        uint256 amountOut;
        uint256 amountInMaximum;
        address[] path;
    }

    /// @notice Swaps an exact amount of one token for as much as possible of another,
    /// sending the output to msg.sender
    /// @param params The parameters necessary for the swap, encoded as `ExactInputV2Params` in calldata
    /// @return amountOut The amount of the received token
    function swapExactTokensForTokensToSelf(ExactInputV2Params calldata params)
        external
        payable
        returns (uint256 amountOut);

    /// @notice Swaps an exact amount of one token for as much as possible of another,
    /// sending the output to address(this)
    /// @param params The parameters necessary for the swap, encoded as `ExactInputV2Params` in calldata
    /// @return amountOut The amount of the received token
    function swapExactTokensForTokensToRouter(ExactInputV2Params calldata params)
        external
        payable
        returns (uint256 amountOut);

    /// @notice Swaps an exact amount of one token for as much as possible of another,
    /// sending the output to `recipient`
    /// @param params The parameters necessary for the swap, encoded as `ExactInputV2Params` in calldata
    /// @param recipient The recipient of the swap
    /// @return amountOut The amount of the received token
    function swapExactTokensForTokensToRecipient(ExactInputV2Params calldata params, address recipient)
        external
        payable
        returns (uint256 amountOut);

    /// @notice Swaps an exact amount of one token for as much as possible of another,
    /// sending the output to msg.sender
    /// @param params The parameters necessary for the swap, encoded as `ExactInputV2Params` in calldata
    /// @return amountOut The amount of the received token
    function swapExactTokensForTokensToSelfHavingPaid(ExactInputV2Params calldata params)
        external
        payable
        returns (uint256 amountOut);

    /// @notice Swaps an exact amount of one token for as much as possible of another,
    /// sending the output to address(this)
    /// @param params The parameters necessary for the swap, encoded as `ExactInputV2Params` in calldata
    /// @return amountOut The amount of the received token
    function swapExactTokensForTokensToRouterHavingPaid(ExactInputV2Params calldata params)
        external
        payable
        returns (uint256 amountOut);

    /// @notice Swaps an exact amount of one token for as much as possible of another,
    /// sending the output to `recipient`
    /// @param params The parameters necessary for the swap, encoded as `ExactInputV2Params` in calldata
    /// @param recipient The recipient of the swap
    /// @return amountOut The amount of the received token
    function swapExactTokensForTokensToRecipientHavingPaid(ExactInputV2Params calldata params, address recipient)
        external
        payable
        returns (uint256 amountOut);

    /// @notice Swaps as little as possible of one token for an exact amount of another token,
    /// sending the output to msg.sender
    /// @param params The parameters necessary for the swap, encoded as `ExactOutputV2Params` in calldata
    /// @return amountIn The amount of token to pay
    function swapTokensForExactTokensToSelf(ExactOutputV2Params calldata params)
        external
        payable
        returns (uint256 amountIn);

    /// @notice Swaps as little as possible of one token for an exact amount of another token,
    /// sending the output to address(this)
    /// @param params The parameters necessary for the swap, encoded as `ExactOutputV2Params` in calldata
    /// @return amountIn The amount of token to pay
    function swapTokensForExactTokensToRouter(ExactOutputV2Params calldata params)
        external
        payable
        returns (uint256 amountIn);

    /// @notice Swaps as little as possible of one token for an exact amount of another token,
    /// sending the output to `recipient`
    /// @param params The parameters necessary for the swap, encoded as `ExactOutputV2Params` in calldata
    /// @param recipient The recipient of the swap
    /// @return amountIn The amount of token to pay
    function swapTokensForExactTokensToRecipient(ExactOutputV2Params calldata params, address recipient)
        external
        payable
        returns (uint256 amountIn);

    /// @notice Swaps as little as possible of one token for an exact amount of another token,
    /// sending the output to msg.sender
    /// @param params The parameters necessary for the swap, encoded as `ExactOutputV2Params` in calldata
    /// @return amountIn The amount of token to pay
    function swapTokensForExactTokensToSelfHavingPaid(ExactOutputV2Params calldata params)
        external
        payable
        returns (uint256 amountIn);

    /// @notice Swaps as little as possible of one token for an exact amount of another token,
    /// sending the output to address(this)
    /// @param params The parameters necessary for the swap, encoded as `ExactOutputV2Params` in calldata
    /// @return amountIn The amount of token to pay
    function swapTokensForExactTokensToRouterHavingPaid(ExactOutputV2Params calldata params)
        external
        payable
        returns (uint256 amountIn);

    /// @notice Swaps as little as possible of one token for an exact amount of another token,
    /// sending the output to `recipient`
    /// @param params The parameters necessary for the swap, encoded as `ExactOutputV2Params` in calldata
    /// @param recipient The recipient of the swap
    /// @return amountIn The amount of token to pay
    function swapTokensForExactTokensToRecipientHavingPaid(ExactOutputV2Params calldata params, address recipient)
        external
        payable
        returns (uint256 amountIn);
}
