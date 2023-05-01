import { bytecode } from '@uniswap/v3-core/artifacts-zk/contracts/UniswapV3Pool.sol/UniswapV3Pool.json'
import { utils } from 'ethers'
import { utils as zkUtils } from 'zksync-web3'

export const POOL_BYTECODE_HASH = zkUtils.hashBytecode(bytecode)

export function computePoolAddress(factoryAddress: string, [tokenA, tokenB]: [string, string], fee: number): string {
  const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase() ? [tokenA, tokenB] : [tokenB, tokenA]
  const constructorArgumentsEncoded = utils.defaultAbiCoder.encode(
    ['address', 'address', 'uint24'],
    [token0, token1, fee]
  )
  return zkUtils.create2Address(factoryAddress, POOL_BYTECODE_HASH, utils.keccak256(constructorArgumentsEncoded), "0x")
}
