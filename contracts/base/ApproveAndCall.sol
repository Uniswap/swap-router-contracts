// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

import '@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

import '../interfaces/IApproveAndCall.sol';
import './ImmutableState.sol';

abstract contract ApproveAndCall is IApproveAndCall, ImmutableState {
    function tryApprove(address token, uint256 amount) private returns (bool) {
        (bool success, bytes memory data) =
            token.call(abi.encodeWithSelector(IERC20.approve.selector, positionManager, amount));
        return success && (data.length == 0 || abi.decode(data, (bool)));
    }

    /// @dev Lens to be called off-chain to determine which (if any) of the approval functions below should be called
    function getApprovalType(address token, uint256 amount) external override returns (ApprovalType) {
        // check existing approval
        uint256 approval = IERC20(token).allowance(address(this), positionManager);
        if (approval >= amount) return ApprovalType.NOT_REQUIRED;

        // try type(uint256).max / type(uint256).max - 1
        if (tryApprove(token, type(uint256).max)) return ApprovalType.MAX;
        if (tryApprove(token, type(uint256).max - 1)) return ApprovalType.MAX_MINUS_ONE;

        // set approval to 0 (must succeed)
        require(tryApprove(token, 0), 'A0');

        // try type(uint256).max / type(uint256).max - 1
        if (tryApprove(token, type(uint256).max)) return ApprovalType.ZERO_THEN_MAX;
        if (tryApprove(token, type(uint256).max - 1)) return ApprovalType.ZERO_THEN_MAX_MINUS_ONE;

        revert('APP');
    }

    function approveMax(address token) external payable override {
        TransferHelper.safeApprove(token, positionManager, type(uint256).max);
    }

    function approveMaxMinusOne(address token) external payable override {
        TransferHelper.safeApprove(token, positionManager, type(uint256).max - 1);
    }

    function approveZeroThenMax(address token) external payable override {
        TransferHelper.safeApprove(token, positionManager, 0);
        TransferHelper.safeApprove(token, positionManager, type(uint256).max);
    }

    function approveZeroThenMaxMinusOne(address token) external payable override {
        TransferHelper.safeApprove(token, positionManager, 0);
        TransferHelper.safeApprove(token, positionManager, type(uint256).max - 1);
    }

    function callPositionManager(bytes calldata data) external payable override returns (bytes memory result) {
        bool success;
        (success, result) = positionManager.call(data);

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
