// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

interface IApproveAndCall {
    function approve(address token, uint256 amount) external payable;

    function callPositionManager(bytes calldata data) external payable returns (bytes memory result);
}
