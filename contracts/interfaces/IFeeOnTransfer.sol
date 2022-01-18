// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.7.5;
pragma abicoder v2;

/// @notice Determine if a token takes a fee on transfer by flash borrowing from the token/<base token> pool on V2.
/// @notice Returns true if we detected a fee is taken on transfer.
/// @notice A return value of false does not mean the token is definitely not a fee on transfer token. It means
/// @notice we are *unsure* if the token will take a fee on transfer.
/// @dev We can not guarantee the result of this lens is correct for a few reasons:
/// 1/ Some tokens only take fees under specific conditions, for example some have an allowlist
///     of addresses that do/dont require fees. Therefore the result is not guaranteed to be correct
///     in all circumstances.
/// 2/ It is possible that the token does not have any pools on V2 therefore we are not able to perform
///     a flashloan to determine if the function would take a fee on transfer.
/// @dev These functions are not marked view because they rely on calling non-view functions and reverting
/// to compute the result.
interface IFeeOnTransfer {
    /// @notice Returns whether a token is fee on transfer or not
    /// @param token The address of the token to check for fee on transfer
    /// @param baseTokens The addresses of the tokens to try pairing with
    /// token when looking for a pool to flash loan from.
    /// @param amountToBorrow The amount to try flash borrowing from the pools
    /// @return bool True if the token is fee on transfer
    function isFeeOnTransfer(
        address token,
        address[] calldata baseTokens,
        uint256 amountToBorrow
    ) external returns (bool);

    /// @notice Returns whether each provided token is fee on transfer or not
    /// @param tokens The addresses of the tokens to check for fee on transfer
    /// @param baseTokens The addresses of the tokens to try pairing with
    /// token when looking for a pool to flash loan from.
    /// @param amountToBorrow The amount to try flash borrowing from the pools
    /// @return bool True if the token is fee on transfer
    function batchIsFeeOnTransfer(
        address[] calldata tokens,
        address[] calldata baseTokens,
        uint256 amountToBorrow
    ) external returns (bool[] memory);
}
