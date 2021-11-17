// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

import '@uniswap/v3-core/contracts/libraries/LowGasSafeMath.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

import './interfaces/IV2SwapRouter.sol';
import './base/ConstantState.sol';
import './base/ImmutableState.sol';
import './base/PeripheryPaymentsWithFeeExtended.sol';
import './libraries/UniswapV2Library.sol';

/// @title Uniswap V2 Swap Router
/// @notice Router for stateless execution of swaps against Uniswap V2
abstract contract V2SwapRouter is IV2SwapRouter, ConstantState, ImmutableState, PeripheryPaymentsWithFeeExtended {
    using LowGasSafeMath for uint256;

    // supports fee-on-transfer tokens
    // requires the initial amount to have already been sent to the first pair
    function _swap(address[] memory path, address _to) private {
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
            address to = i < path.length - 2 ? UniswapV2Library.pairFor(factoryV2, output, path[i + 2]) : _to;
            pair.swap(amount0Out, amount1Out, to, new bytes(0));
        }
    }

    /// @inheritdoc IV2SwapRouter
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        bool hasAlreadyPaid
    ) external payable override returns (uint256 amountOut) {
        pay(
            path[0],
            hasAlreadyPaid ? address(this) : msg.sender,
            UniswapV2Library.pairFor(factoryV2, path[0], path[1]),
            amountIn
        );

        // find and replace to addresses
        if (to == MSG_SENDER) to = msg.sender;
        else if (to == ADDRESS_THIS) to = address(this);

        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(to);

        _swap(path, to);

        amountOut = IERC20(path[path.length - 1]).balanceOf(to).sub(balanceBefore);
        require(amountOut >= amountOutMin, 'UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT');
    }

    /// @inheritdoc IV2SwapRouter
    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        bool hasAlreadyPaid
    ) external payable override returns (uint256 amountIn) {
        amountIn = UniswapV2Library.getAmountsIn(factoryV2, amountOut, path)[0];
        require(amountIn <= amountInMax, 'UniswapV2Router: EXCESSIVE_INPUT_AMOUNT');

        pay(
            path[0],
            hasAlreadyPaid ? address(this) : msg.sender,
            UniswapV2Library.pairFor(factoryV2, path[0], path[1]),
            amountIn
        );

        // find and replace to addresses
        if (to == MSG_SENDER) to = msg.sender;
        else if (to == ADDRESS_THIS) to = address(this);

        _swap(path, to);
    }
}
