// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

import '../interfaces/IApproveAndCall.sol';
import './ImmutableState.sol';

abstract contract ApproveAndCall is IApproveAndCall, ImmutableState {
    function tryApprove(address token, uint256 amount) private returns (bool) {
        (bool success, bytes memory data) =
            token.call(abi.encodeWithSelector(IERC20.approve.selector, positionManager, amount));
        return success && (data.length == 0 || abi.decode(data, (bool)));
    }

    /// @dev Can be called off-chain to determine which of the more efficient functions below should be called
    function approve(address token) external payable override returns (SuccessfulApproveType) {
        // try type(uint256).max / type(uint256).max - 1
        if (tryApprove(token, type(uint256).max)) return SuccessfulApproveType.MAX;
        if (tryApprove(token, type(uint256).max - 1)) return SuccessfulApproveType.MAX_MINUS_ONE;

        // set approval to 0 (must succeed)
        require(tryApprove(token, 0), 'A0');

        // try type(uint256).max / type(uint256).max - 1
        if (tryApprove(token, type(uint256).max)) return SuccessfulApproveType.ZERO_THEN_MAX;
        if (tryApprove(token, type(uint256).max - 1)) return SuccessfulApproveType.ZERO_THEN_MAX_MINUS_ONE;

        revert('AR');
    }

    function approveMax(address token) external payable override {
        require(tryApprove(token, type(uint256).max), 'M');
    }

    function approveMaxMinusOne(address token) external payable override {
        require(tryApprove(token, type(uint256).max - 1), 'M1');
    }

    function approveZeroThenMax(address token) external payable override {
        require(tryApprove(token, 0), 'ZERO');
        require(tryApprove(token, type(uint256).max), '0M');
    }

    function approveZeroThenMaxMinusOne(address token) external payable override {
        require(tryApprove(token, 0), 'ZERO');
        require(tryApprove(token, type(uint256).max - 1), '0M1');
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
