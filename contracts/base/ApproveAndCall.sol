// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

import '@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

import '../interfaces/IApproveAndCall.sol';
import './ImmutableState.sol';

abstract contract ApproveAndCall is IApproveAndCall, ImmutableState {
    function getTargetAddress(Target target) private view returns (address) {
        return target == Target.POSITION_MANAGER ? positionManager : zeroEx;
    }

    function tryApprove(
        address token,
        address target,
        uint256 amount
    ) private returns (bool) {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(IERC20.approve.selector, target, amount));
        return success && (data.length == 0 || abi.decode(data, (bool)));
    }

    /// @inheritdoc IApproveAndCall
    function getApprovalType(
        Target target,
        address token,
        uint256 amount
    ) external override returns (ApprovalType) {
        address targetAddress = getTargetAddress(target);

        // check existing approval
        uint256 approval = IERC20(token).allowance(address(this), targetAddress);
        if (approval >= amount) return ApprovalType.NOT_REQUIRED;

        // try type(uint256).max / type(uint256).max - 1
        if (tryApprove(token, targetAddress, type(uint256).max)) return ApprovalType.MAX;
        if (tryApprove(token, targetAddress, type(uint256).max - 1)) return ApprovalType.MAX_MINUS_ONE;

        // set approval to 0 (must succeed)
        require(tryApprove(token, targetAddress, 0), 'A0');

        // try type(uint256).max / type(uint256).max - 1
        if (tryApprove(token, targetAddress, type(uint256).max)) return ApprovalType.ZERO_THEN_MAX;
        if (tryApprove(token, targetAddress, type(uint256).max - 1)) return ApprovalType.ZERO_THEN_MAX_MINUS_ONE;

        revert('APP');
    }

    /// @inheritdoc IApproveAndCall
    function approveMax(Target target, address token) external payable override {
        TransferHelper.safeApprove(token, getTargetAddress(target), type(uint256).max);
    }

    /// @inheritdoc IApproveAndCall
    function approveMaxMinusOne(Target target, address token) external payable override {
        TransferHelper.safeApprove(token, getTargetAddress(target), type(uint256).max - 1);
    }

    /// @inheritdoc IApproveAndCall
    function approveZeroThenMax(Target target, address token) external payable override {
        address targetAddress = getTargetAddress(target);
        TransferHelper.safeApprove(token, targetAddress, 0);
        TransferHelper.safeApprove(token, targetAddress, type(uint256).max);
    }

    /// @inheritdoc IApproveAndCall
    function approveZeroThenMaxMinusOne(Target target, address token) external payable override {
        address targetAddress = getTargetAddress(target);
        TransferHelper.safeApprove(token, targetAddress, 0);
        TransferHelper.safeApprove(token, targetAddress, type(uint256).max - 1);
    }

    /// @inheritdoc IApproveAndCall
    function callTarget(Target target, bytes calldata data) external payable override returns (bytes memory result) {
        bool success;
        (success, result) = getTargetAddress(target).call(data);

        if (!success) {
            // Next 5 lines from https://ethereum.stackexchange.com/a/83577
            if (result.length < 68) revert();
            assembly {
                result := add(result, 0x04)
            }
            revert(abi.decode(result, (string)));
        }
    }
}
