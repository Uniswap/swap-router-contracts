// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

import '@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol';

import '../interfaces/IApproveAndCall.sol';
import './ImmutableState.sol';

abstract contract ApproveAndCall is IApproveAndCall, ImmutableState {
    function approve(address token, uint256 amount) external payable override {
        TransferHelper.safeApprove(token, positionManager, amount);
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
