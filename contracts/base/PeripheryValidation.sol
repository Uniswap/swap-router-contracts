// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;

import './BlockTimestamp.sol';

abstract contract PeripheryValidation is BlockTimestamp {
    modifier checkDeadline(uint256 deadline) {
        require(_blockTimestamp() <= deadline, 'Transaction too old');
        _;
    }

    modifier checkPreviousBlockhash(bytes32 previousBlockhash) {
        require(blockhash(block.number - 1) == previousBlockhash, 'Unexpected parent block');
        _;
    }
}
