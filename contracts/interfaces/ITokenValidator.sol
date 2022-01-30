// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.7.5;
pragma abicoder v2;

/// @notice Validates tokens by flash borrowing from the token/<base token> pool on V2.
/// @notice Returns
///     Status.FOT if we detected a fee is taken on transfer.
///     Status.STF if transfer failed for the token.
///     Status.UNKN if we did not detect any issues with the token.
/// @notice A return value of Status.UNKN does not mean the token is definitely not a fee on transfer token
///     or definitely has no problems with its transfer. It just means we cant say for sure that it has any
///     issues.
/// @dev We can not guarantee the result of this lens is correct for a few reasons:
/// @dev 1/ Some tokens take fees or allow transfers under specific conditions, for example some have an allowlist
/// @dev    of addresses that do/dont require fees. Therefore the result is not guaranteed to be correct
/// @dev    in all circumstances.
/// @dev 2/ It is possible that the token does not have any pools on V2 therefore we are not able to perform
/// @dev    a flashloan to test the token.
/// @dev These functions are not marked view because they rely on calling non-view functions and reverting
/// to compute the result.
interface ITokenValidator {
    // Status.FOT: detected a fee is taken on transfer.
    // Status.STF: transfer failed for the token.
    // Status.UNKN: no issues found with the token.
    enum Status {UNKN, FOT, STF}

    /// @notice Validates a token by detecting if its transferable or takes a fee on transfer
    /// @param token The address of the token to check for fee on transfer
    /// @param baseTokens The addresses of the tokens to try pairing with
    /// token when looking for a pool to flash loan from.
    /// @param amountToBorrow The amount to try flash borrowing from the pools
    /// @return The status of the token
    function validate(
        address token,
        address[] calldata baseTokens,
        uint256 amountToBorrow
    ) external returns (Status);

    /// @notice Validates each token by detecting if its transferable or takes a fee on transfer
    /// @param tokens The addresses of the tokens to check for fee on transfer
    /// @param baseTokens The addresses of the tokens to try pairing with
    /// token when looking for a pool to flash loan from.
    /// @param amountToBorrow The amount to try flash borrowing from the pools
    /// @return The status of the token
    function batchValidate(
        address[] calldata tokens,
        address[] calldata baseTokens,
        uint256 amountToBorrow
    ) external returns (Status[] memory);
}
