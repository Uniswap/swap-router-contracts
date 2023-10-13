// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;

import '../libraries/UniswapV2Library.sol';

contract TestUniswapV2Library {
    function testEqualityAmountIn(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) external pure {
        uint256 amountOut = UniswapV2Library.getAmountOut(amountIn, reserveIn, reserveOut);
        uint256 amountInComputed = UniswapV2Library.getAmountIn(amountOut, reserveIn, reserveOut);
        require(amountIn == amountInComputed);
    }

    function testEqualityAmountOut(
        uint256 amountOut,
        uint256 reserveIn,
        uint256 reserveOut
    ) external pure {
        uint256 amountIn = UniswapV2Library.getAmountIn(amountOut, reserveIn, reserveOut);
        uint256 amountOutComputed = UniswapV2Library.getAmountOut(amountIn, reserveIn, reserveOut);
        require(amountOut == amountOutComputed);
    }
}
