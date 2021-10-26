// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.7.6;
pragma abicoder v2;

import '../base/MulticallExtended.sol';

contract TestMulticallExtended is MulticallExtended {
    uint256 time;

    function _blockTimestamp() internal view override returns (uint256) {
        return time;
    }

    function setTime(uint256 _time) external {
        time = _time;
    }

    struct Tuple {
        uint256 a;
        uint256 b;
    }

    function functionThatReturnsTuple(uint256 a, uint256 b) external pure returns (Tuple memory tuple) {
        tuple = Tuple({b: a, a: b});
    }
}
