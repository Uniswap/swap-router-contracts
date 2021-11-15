// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

import '@uniswap/v3-core/contracts/libraries/LowGasSafeMath.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

import './interfaces/IV2SwapRouter.sol';
import './base/ImmutableState.sol';
import './libraries/UniswapV2Library.sol';
import './base/PeripheryPaymentsWithFeeExtended.sol';

/// @title Uniswap V2 Swap Router
/// @notice Router for stateless execution of swaps against Uniswap V2
abstract contract V2SwapRouter is IV2SwapRouter, ImmutableState, PeripheryPaymentsWithFeeExtended {
    using LowGasSafeMath for uint256;

    // supports fee-on-transfer tokens
    // requires the initial amount to have already been sent to the first pair
    function _swap(address[] memory path, address recipient) private {
        for (uint256 i; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0, ) = UniswapV2Library.sortTokens(input, output);
            IUniswapV2Pair pair = IUniswapV2Pair(UniswapV2Library.pairFor(factoryV2, input, output));
            uint256 amountInput;
            uint256 amountOutput;
            // scope to avoid stack too deep errors
            {
                (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();
                (uint256 reserveInput, uint256 reserveOutput) =
                    input == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
                amountInput = IERC20(input).balanceOf(address(pair)).sub(reserveInput);
                amountOutput = UniswapV2Library.getAmountOut(amountInput, reserveInput, reserveOutput);
            }
            (uint256 amount0Out, uint256 amount1Out) =
                input == token0 ? (uint256(0), amountOutput) : (amountOutput, uint256(0));
            address to = i < path.length - 2 ? UniswapV2Library.pairFor(factoryV2, output, path[i + 2]) : recipient;
            pair.swap(amount0Out, amount1Out, to, new bytes(0));
        }
    }

    function swapExactTokensForTokens(
        ExactInputV2Params calldata params,
        address recipient,
        bool hasAlreadyPaid
    ) internal returns (uint256 amountOut) {
        pay(
            params.path[0],
            hasAlreadyPaid ? address(this) : msg.sender,
            UniswapV2Library.pairFor(factoryV2, params.path[0], params.path[1]),
            params.amountIn
        );

        uint256 balanceBefore = IERC20(params.path[params.path.length - 1]).balanceOf(recipient);

        _swap(params.path, recipient);

        amountOut = IERC20(params.path[params.path.length - 1]).balanceOf(recipient).sub(balanceBefore);
        require(amountOut >= params.amountOutMinimum, 'UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT');
    }

    /// @inheritdoc IV2SwapRouter
    function swapExactTokensForTokensToSelf(ExactInputV2Params calldata params)
        external
        payable
        override
        returns (uint256 amountOut)
    {
        return swapExactTokensForTokens(params, msg.sender, false);
    }

    /// @inheritdoc IV2SwapRouter
    function swapExactTokensForTokensToRouter(ExactInputV2Params calldata params)
        external
        payable
        override
        returns (uint256 amountOut)
    {
        return swapExactTokensForTokens(params, address(this), false);
    }

    /// @inheritdoc IV2SwapRouter
    function swapExactTokensForTokensToRecipient(ExactInputV2Params calldata params, address recipient)
        external
        payable
        override
        returns (uint256 amountOut)
    {
        return swapExactTokensForTokens(params, recipient, false);
    }

    /// @inheritdoc IV2SwapRouter
    function swapExactTokensForTokensToSelfHavingPaid(ExactInputV2Params calldata params)
        external
        payable
        override
        returns (uint256 amountOut)
    {
        return swapExactTokensForTokens(params, msg.sender, true);
    }

    /// @inheritdoc IV2SwapRouter
    function swapExactTokensForTokensToRouterHavingPaid(ExactInputV2Params calldata params)
        external
        payable
        override
        returns (uint256 amountOut)
    {
        return swapExactTokensForTokens(params, address(this), true);
    }

    /// @inheritdoc IV2SwapRouter
    function swapExactTokensForTokensToRecipientHavingPaid(ExactInputV2Params calldata params, address recipient)
        external
        payable
        override
        returns (uint256 amountOut)
    {
        return swapExactTokensForTokens(params, recipient, true);
    }

    function swapTokensForExactTokens(
        ExactOutputV2Params calldata params,
        address recipient,
        bool hasAlreadyPaid
    ) internal returns (uint256 amountIn) {
        amountIn = UniswapV2Library.getAmountsIn(factoryV2, params.amountOut, params.path)[0];
        require(amountIn <= params.amountInMaximum, 'UniswapV2Router: EXCESSIVE_INPUT_AMOUNT');

        pay(
            params.path[0],
            hasAlreadyPaid ? address(this) : msg.sender,
            UniswapV2Library.pairFor(factoryV2, params.path[0], params.path[1]),
            amountIn
        );

        _swap(params.path, recipient);
    }

    /// @inheritdoc IV2SwapRouter
    function swapTokensForExactTokensToSelf(ExactOutputV2Params calldata params)
        external
        payable
        override
        returns (uint256 amountIn)
    {
        return swapTokensForExactTokens(params, msg.sender, false);
    }

    /// @inheritdoc IV2SwapRouter
    function swapTokensForExactTokensToRouter(ExactOutputV2Params calldata params)
        external
        payable
        override
        returns (uint256 amountIn)
    {
        return swapTokensForExactTokens(params, address(this), false);
    }

    /// @inheritdoc IV2SwapRouter
    function swapTokensForExactTokensToRecipient(ExactOutputV2Params calldata params, address recipient)
        external
        payable
        override
        returns (uint256 amountIn)
    {
        return swapTokensForExactTokens(params, recipient, false);
    }

    /// @inheritdoc IV2SwapRouter
    function swapTokensForExactTokensToSelfHavingPaid(ExactOutputV2Params calldata params)
        external
        payable
        override
        returns (uint256 amountIn)
    {
        return swapTokensForExactTokens(params, msg.sender, true);
    }

    /// @inheritdoc IV2SwapRouter
    function swapTokensForExactTokensToRouterHavingPaid(ExactOutputV2Params calldata params)
        external
        payable
        override
        returns (uint256 amountIn)
    {
        return swapTokensForExactTokens(params, address(this), true);
    }

    /// @inheritdoc IV2SwapRouter
    function swapTokensForExactTokensToRecipientHavingPaid(ExactOutputV2Params calldata params, address recipient)
        external
        payable
        override
        returns (uint256 amountIn)
    {
        return swapTokensForExactTokens(params, recipient, true);
    }
}
