// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

interface IApproveAndCall {
    enum SuccessfulApproveType {MAX, MAX_MINUS_ONE, ZERO_THEN_MAX, ZERO_THEN_MAX_MINUS_ONE}

    function approve(address token) external payable returns (SuccessfulApproveType);

    function approveMax(address token) external payable;

    function approveMaxMinusOne(address token) external payable;

    function approveZeroThenMax(address token) external payable;

    function approveZeroThenMaxMinusOne(address token) external payable;

    function callPositionManager(bytes[] calldata data) external payable returns (bytes[] memory results);
}
