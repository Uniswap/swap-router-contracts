// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

import '@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol';

import '../interfaces/IApproveAndCall.sol';

abstract contract ApproveAndCall is IApproveAndCall  {
    function approveAndCall(
        address[] calldata approveTokens,
        uint256[] calldata approveAmounts,
        address target,
        bytes[] calldata data
    )
        external
        payable
        override
        returns (bytes[] memory results)
    {
        require(approveTokens.length == approveAmounts.length, 'Length mismatch');

        // approve token(s) for amount(s)
        for (uint256 i = 0; i < data.length; i++) {
            TransferHelper.safeApprove(approveTokens[i], target, approveAmounts[0]);
        }

        // make call(s)
        results = new bytes[](data.length);
        for (uint256 i = 0; i < data.length; i++) {
            (bool success, bytes memory result) = target.call(data[i]);

            if (!success) {
                // Next 5 lines from https://ethereum.stackexchange.com/a/83577
                if (result.length < 68) revert();
                assembly {
                    result := add(result, 0x04)
                }
                revert(abi.decode(result, (string)));
            }

            results[i] = result;
        }

        // unapprove token(s)
        for (uint256 i = 0; i < data.length; i++) {
            TransferHelper.safeApprove(approveTokens[i], target, 0);
        }
    }
}
