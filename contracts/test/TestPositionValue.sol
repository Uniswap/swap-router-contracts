import '@uniswap/v3-periphery/contracts/libraries/PositionValue.sol';

contract TestPositionValue {
    function principal(
        INonfungiblePositionManager positionManager,
        uint256 tokenId,
        uint160 sqrtRatioX96
    ) external view returns (uint256 amount0, uint256 amount1) {
        (amount0, amount1) = PositionValue.principal(positionManager, tokenId, sqrtRatioX96);
    }
}
