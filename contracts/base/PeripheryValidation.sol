// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;

import '../interfaces/IPeripheryValidation.sol';
import './BlockTimestamp.sol';

abstract contract PeripheryValidation is IPeripheryValidation, BlockTimestamp {
    function checkDeadline(uint256 deadline) external override view {
        require(_blockTimestamp() <= deadline, 'Transaction too old');
    }

    function checkPreviousBlockhash(bytes32 previousBlockhash) external override view {
        require(blockhash(block.number - 1) == previousBlockhash, 'Unexpected parent block');
    }
}
