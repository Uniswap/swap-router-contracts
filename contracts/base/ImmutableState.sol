// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;

import '../interfaces/IImmutableState.sol';

/// @title Immutable state
/// @notice Immutable state used by the swap router
abstract contract ImmutableState is IImmutableState {
    /// @inheritdoc IImmutableState
    address public immutable override factoryV2;
    /// @inheritdoc IImmutableState
    address public immutable override positionManager;
    /// @inheritdoc IImmutableState
    address public immutable override zeroEx;

    constructor(
        address _factoryV2,
        address _positionManager,
        address _zeroEx
    ) {
        factoryV2 = _factoryV2;
        positionManager = _positionManager;
        zeroEx = _zeroEx;
    }
}
