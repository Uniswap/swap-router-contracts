// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

interface IApproveAndCall {
    function approveAndCall(
        address[] calldata approveTokens,
        uint256[] calldata approveAmounts,
        address target,
        bytes[] calldata data
    )
        external
        payable
        returns (bytes[] memory results);
}
