import { Wallet, Contract } from 'ethers'
import { FeeAmount, TICK_SPACINGS } from './constants'
import { encodePriceSqrt } from './encodePriceSqrt'
import { getMaxTick, getMinTick } from './ticks'

export async function createPool(nft: Contract, wallet: Wallet, tokenAddressA: string, tokenAddressB: string) {
  if (tokenAddressA.toLowerCase() > tokenAddressB.toLowerCase())
    [tokenAddressA, tokenAddressB] = [tokenAddressB, tokenAddressA]

  await nft.createAndInitializePoolIfNecessary(tokenAddressA, tokenAddressB, FeeAmount.MEDIUM, encodePriceSqrt(1, 1))

  const liquidityParams = {
    token0: tokenAddressA,
    token1: tokenAddressB,
    fee: FeeAmount.MEDIUM,
    tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
    tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
    recipient: wallet.address,
    amount0Desired: 1000000,
    amount1Desired: 1000000,
    amount0Min: 0,
    amount1Min: 0,
    deadline: 2 ** 32,
  }

  return nft.mint(liquidityParams)
}

export async function createPoolWithMultiplePositions(
  nft: Contract,
  wallet: Wallet,
  tokenAddressA: string,
  tokenAddressB: string
) {
  if (tokenAddressA.toLowerCase() > tokenAddressB.toLowerCase())
    [tokenAddressA, tokenAddressB] = [tokenAddressB, tokenAddressA]

  await nft.createAndInitializePoolIfNecessary(tokenAddressA, tokenAddressB, FeeAmount.MEDIUM, encodePriceSqrt(1, 1))

  const liquidityParams = {
    token0: tokenAddressA,
    token1: tokenAddressB,
    fee: FeeAmount.MEDIUM,
    tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
    tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
    recipient: wallet.address,
    amount0Desired: 1000000,
    amount1Desired: 1000000,
    amount0Min: 0,
    amount1Min: 0,
    deadline: 2 ** 32,
  }

  await nft.mint(liquidityParams)

  const liquidityParams2 = {
    token0: tokenAddressA,
    token1: tokenAddressB,
    fee: FeeAmount.MEDIUM,
    tickLower: -60,
    tickUpper: 60,
    recipient: wallet.address,
    amount0Desired: 100,
    amount1Desired: 100,
    amount0Min: 0,
    amount1Min: 0,
    deadline: 2 ** 32,
  }

  await nft.mint(liquidityParams2)

  const liquidityParams3 = {
    token0: tokenAddressA,
    token1: tokenAddressB,
    fee: FeeAmount.MEDIUM,
    tickLower: -120,
    tickUpper: 120,
    recipient: wallet.address,
    amount0Desired: 100,
    amount1Desired: 100,
    amount0Min: 0,
    amount1Min: 0,
    deadline: 2 ** 32,
  }

  return nft.mint(liquidityParams3)
}

export async function createPoolWithZeroTickInitialized(
  nft: Contract,
  wallet: Wallet,
  tokenAddressA: string,
  tokenAddressB: string
) {
  if (tokenAddressA.toLowerCase() > tokenAddressB.toLowerCase())
    [tokenAddressA, tokenAddressB] = [tokenAddressB, tokenAddressA]

  await nft.createAndInitializePoolIfNecessary(tokenAddressA, tokenAddressB, FeeAmount.MEDIUM, encodePriceSqrt(1, 1))

  const liquidityParams = {
    token0: tokenAddressA,
    token1: tokenAddressB,
    fee: FeeAmount.MEDIUM,
    tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
    tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
    recipient: wallet.address,
    amount0Desired: 1000000,
    amount1Desired: 1000000,
    amount0Min: 0,
    amount1Min: 0,
    deadline: 2 ** 32,
  }

  await nft.mint(liquidityParams)

  const liquidityParams2 = {
    token0: tokenAddressA,
    token1: tokenAddressB,
    fee: FeeAmount.MEDIUM,
    tickLower: 0,
    tickUpper: 60,
    recipient: wallet.address,
    amount0Desired: 100,
    amount1Desired: 100,
    amount0Min: 0,
    amount1Min: 0,
    deadline: 2 ** 32,
  }

  await nft.mint(liquidityParams2)

  const liquidityParams3 = {
    token0: tokenAddressA,
    token1: tokenAddressB,
    fee: FeeAmount.MEDIUM,
    tickLower: -120,
    tickUpper: 0,
    recipient: wallet.address,
    amount0Desired: 100,
    amount1Desired: 100,
    amount0Min: 0,
    amount1Min: 0,
    deadline: 2 ** 32,
  }

  return nft.mint(liquidityParams3)
}

/**
 * Create V2 pairs for testing with IL routes
 */
export async function createPair(v2Factory: Contract, tokenAddressA: string, tokenAddressB: string): Promise<string> {
  // .createPair() sorts the tokens already
  const receipt = await (await v2Factory.createPair(tokenAddressA, tokenAddressB)).wait()
  // we can extract the pair address from the emitted event
  // always the 3rd element:         emit PairCreated(token0, token1, pair, allPairs.length);
  const pairAddress = receipt.events[0].args[2]
  if (!pairAddress) throw new Error('pairAddress not found in txn receipt')
  return pairAddress
}
