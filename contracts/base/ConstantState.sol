// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;

/// @title Constant state
/// @notice Constant state used by the swap router
abstract contract ConstantState {
    /// @dev Used as a flag for identifying msg.sender, saves gas by sending more 0 bytes
    address internal constant MSG_SENDER = address(0);

    /// @dev Used as a flag for identifying address(this), saves gas by sending more 0 bytes
    address internal constant ADDRESS_THIS = address(1);
}
