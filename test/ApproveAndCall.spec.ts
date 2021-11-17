import { defaultAbiCoder } from '@ethersproject/abi'
import { Fixture } from 'ethereum-waffle'
import { constants, Contract, ContractTransaction, Wallet } from 'ethers'
import { solidityPack } from 'ethers/lib/utils'
import { ethers, waffle } from 'hardhat'
import { MockTimeSwapRouter02, TestERC20 } from '../typechain'
import completeFixture from './shared/completeFixture'
import { ADDRESS_THIS, FeeAmount, TICK_SPACINGS } from './shared/constants'
import { encodePriceSqrt } from './shared/encodePriceSqrt'
import { expandTo18Decimals } from './shared/expandTo18Decimals'
import { expect } from './shared/expect'
import { encodePath } from './shared/path'
import { getMaxTick, getMinTick } from './shared/ticks'

describe('ApproveAndCall', function () {
  this.timeout(40000)
  let wallet: Wallet
  let trader: Wallet

  const swapRouterFixture: Fixture<{
    router: MockTimeSwapRouter02
    nft: Contract
    tokens: [TestERC20, TestERC20, TestERC20]
  }> = async (wallets, provider) => {
    const { router, tokens, nft } = await completeFixture(wallets, provider)

    // approve & fund wallets
    for (const token of tokens) {
      await token.approve(router.address, constants.MaxUint256)
      await token.approve(nft.address, constants.MaxUint256)
      await token.connect(trader).approve(router.address, constants.MaxUint256)
      await token.transfer(trader.address, expandTo18Decimals(1_000_000))
    }

    return {
      router,
      tokens,
      nft,
    }
  }

  let router: MockTimeSwapRouter02
  let nft: Contract
  let tokens: [TestERC20, TestERC20, TestERC20]

  let loadFixture: ReturnType<typeof waffle.createFixtureLoader>

  function encodeSweepToken(token: string, amount: number) {
    const functionSignature = 'sweepToken(address,uint256)'
    return solidityPack(
      ['bytes4', 'bytes'],
      [router.interface.getSighash(functionSignature), defaultAbiCoder.encode(['address', 'uint256'], [token, amount])]
    )
  }

  before('create fixture loader', async () => {
    ;[wallet, trader] = await (ethers as any).getSigners()
    loadFixture = waffle.createFixtureLoader([wallet, trader])
  })

  beforeEach('load fixture', async () => {
    ;({ router, tokens, nft } = await loadFixture(swapRouterFixture))
  })

  describe('swap and add', () => {
    async function createPool(tokenAddressA: string, tokenAddressB: string) {
      if (tokenAddressA.toLowerCase() > tokenAddressB.toLowerCase())
        [tokenAddressA, tokenAddressB] = [tokenAddressB, tokenAddressA]

      await nft.createAndInitializePoolIfNecessary(
        tokenAddressA,
        tokenAddressB,
        FeeAmount.MEDIUM,
        encodePriceSqrt(1, 1)
      )

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

    beforeEach('create 0-1 pool', async () => {
      await createPool(tokens[0].address, tokens[1].address)
    })

    async function singleAssetAddExactInput(
      tokenIn: string,
      tokenOut: string,
      amountIn: number = 3,
      amountOutMinimum: number = 1
    ): Promise<ContractTransaction> {
      // encode the exact input swap
      const params = {
        path: encodePath([tokenIn, tokenOut], [FeeAmount.MEDIUM]),
        recipient: ADDRESS_THIS, // have to send to the router, as it will be adding liquidity for the caller
        amountIn,
        amountOutMinimum,
        hasAlreadyPaid: false,
      }
      // ensure that the swap fails if the limit is any tighter
      const amountOut = await router.connect(trader).callStatic.exactInput(params)
      expect(amountOut.toNumber()).to.be.eq(amountOutMinimum)
      const data = [router.interface.encodeFunctionData('exactInput', [params])]

      // encode the pull (we take the same as the amountOutMinimum, assuming a 50/50 range)
      data.push(router.interface.encodeFunctionData('pull', [tokenIn, amountOutMinimum]))

      // encode the approves
      data.push(router.interface.encodeFunctionData('approveMax', [tokenIn]))
      data.push(router.interface.encodeFunctionData('approveMax', [tokenOut]))

      // encode the add liquidity
      const [token0, token1] =
        tokenIn.toLowerCase() < tokenOut.toLowerCase() ? [tokenIn, tokenOut] : [tokenOut, tokenIn]
      const liquidityParams = {
        token0,
        token1,
        fee: FeeAmount.MEDIUM,
        tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        recipient: trader.address,
        amount0Desired: amountOutMinimum,
        amount1Desired: amountOutMinimum,
        amount0Min: 0,
        amount1Min: 0,
        deadline: 2 ** 32,
      }
      data.push(
        router.interface.encodeFunctionData('callPositionManager', [
          nft.interface.encodeFunctionData('mint', [liquidityParams]),
        ])
      )

      // encode the sweeps
      data.push(encodeSweepToken(tokenIn, 0))
      data.push(encodeSweepToken(tokenOut, 0))

      return router.connect(trader)['multicall(bytes[])'](data)
    }

    describe('single-asset add', () => {
      it('0 -> 1', async () => {
        let traderNFTBalanceBefore = await nft.balanceOf(trader.address)
        expect(traderNFTBalanceBefore.toNumber()).to.be.eq(0)

        await singleAssetAddExactInput(tokens[0].address, tokens[1].address, 1000, 996)

        traderNFTBalanceBefore = await nft.balanceOf(trader.address)
        expect(traderNFTBalanceBefore.toNumber()).to.be.eq(1)
      })
    })
  })
})
