// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@uniswap/v3-periphery/contracts/base/PeripheryImmutableState.sol';
import '@uniswap/v2-core/contracts/interfaces/IUniswapV2Callee.sol';
import '@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol';
import '../libraries/UniswapV2Library.sol';
import '../interfaces/ISwapRouter02.sol';
import '../interfaces/IFeeOnTransfer.sol';
import '../base/ImmutableState.sol';

/// @notice Determine if a token takes a fee on transfer by flash borrowing from the token/<base token> pool on V2.
/// @notice Returns true if we detected a fee is taken on transfer.
/// @notice A return value of false does not mean the token is definitely not a fee on transfer token. It means
/// @notice we are *unsure* if the token will take a fee on transfer.
/// @dev We can not guarantee the result of this lens is correct for a few reasons:
/// @dev 1/ Some tokens take fees under specific conditions, for example some have an allowlist
/// @dev    of addresses that do/dont require fees. Therefore the result is not guaranteed to be correct
/// @dev    in all circumstances.
/// @dev 2/ It is possible that the token does not have any pools on V2 therefore we are not able to perform
/// @dev    a flashloan to test the transfer.
contract FeeOnTransfer is IFeeOnTransfer, IUniswapV2Callee, ImmutableState {
    string internal constant FOT_REVERT_STRING = 'FOT';

    constructor(address _factoryV2, address _positionManager) ImmutableState(_factoryV2, _positionManager) {}

    function batchIsFeeOnTransfer(
        address[] calldata tokens,
        address[] calldata baseTokens,
        uint256 amountToBorrow
    ) public override returns (bool[] memory isFotResults) {
        isFotResults = new bool[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            isFotResults[i] = isFeeOnTransfer(tokens[i], baseTokens, amountToBorrow);
        }
    }

    function isFeeOnTransfer(
        address token,
        address[] calldata baseTokens,
        uint256 amountToBorrow
    ) public override returns (bool) {
        for (uint256 i = 0; i < baseTokens.length; i++) {
            if (_isFeeOnTransfer(token, baseTokens[i], amountToBorrow)) {
                return true;
            }
        }
        return false;
    }

    function _isFeeOnTransfer(
        address token,
        address baseToken,
        uint256 amountToBorrow
    ) internal returns (bool) {
        if (token == baseToken) {
            return false;
        }

        address pairAddress = UniswapV2Library.pairFor(this.factoryV2(), token, baseToken);

        // If the token/baseToken pair exists, get token0.
        // Must do low level call as try/catch does not support case where contract does not exist.
        (, bytes memory returnData) = address(pairAddress).call(abi.encodeWithSelector(IUniswapV2Pair.token0.selector));

        if (returnData.length == 0) {
            return false;
        }

        address token0Address = abi.decode(returnData, (address));

        // Flash loan {amountToBorrow}
        (uint256 amount0Out, uint256 amount1Out) =
            token == token0Address ? (amountToBorrow, uint256(0)) : (uint256(0), amountToBorrow);

        uint256 balanceBeforeLoan = IERC20(token).balanceOf(address(this));

        IUniswapV2Pair pair = IUniswapV2Pair(pairAddress);
        try
            pair.swap(amount0Out, amount1Out, address(this), abi.encode(balanceBeforeLoan, amountToBorrow))
        {} catch Error(string memory reason) {
            return keccak256(bytes(reason)) == keccak256(bytes(FOT_REVERT_STRING));
        }

        // Swap always reverts so should never reach.
        revert('Unexpected error');
    }

    function uniswapV2Call(
        address,
        uint256 amount0,
        uint256,
        bytes calldata data
    ) external view override {
        IUniswapV2Pair pair = IUniswapV2Pair(msg.sender);
        (address token0, address token1) = (pair.token0(), pair.token1());

        IERC20 tokenBorrowed = IERC20(amount0 > 0 ? token0 : token1);

        (uint256 balanceBeforeLoan, uint256 amountRequestedToBorrow) = abi.decode(data, (uint256, uint256));
        uint256 amountBorrowed = tokenBorrowed.balanceOf(address(this)) - balanceBeforeLoan;

        // If we received less token than we requested when we called swap, then a fee must have been taken
        // by the token during transfer.
        if (amountBorrowed != amountRequestedToBorrow) {
            revert(FOT_REVERT_STRING);
        }

        // Note: If we do not revert here, we would end up reverting in the pair's swap method anyway
        // since for a flash borrow we need to transfer back the amount we borrowed + 0.3% fee, and we don't
        // have funds to cover the fee. Revert early here to save gas/time.
        revert('Unknown');
    }
}
