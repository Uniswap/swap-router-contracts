// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.7.5;

import '@uniswap/v3-periphery/contracts/base/PeripheryPayments.sol';
import '@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol';

import '../interfaces/IPeripheryPaymentsExtended.sol';

abstract contract PeripheryPaymentsExtended is IPeripheryPaymentsExtended, PeripheryPayments {
    /// @inheritdoc IPeripheryPaymentsExtended
    function unwrapWETH9(uint256 amountMinimum) external payable override {
        unwrapWETH9(amountMinimum, msg.sender);
    }

    /// @inheritdoc IPeripheryPaymentsExtended
    function wrapETH(uint256 value) external payable override {
        IWETH9(WETH9).deposit{value: value}();
    }

    /// @inheritdoc IPeripheryPaymentsExtended
    function sweepToken(address token, uint256 amountMinimum) external payable override {
        sweepToken(token, amountMinimum, msg.sender);
    }

    /// @inheritdoc IPeripheryPaymentsExtended
    function pull(address token, uint256 value) external payable override {
        TransferHelper.safeTransferFrom(token, msg.sender, address(this), value);
    }
}
