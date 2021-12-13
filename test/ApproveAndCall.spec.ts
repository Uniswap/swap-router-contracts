import { defaultAbiCoder } from '@ethersproject/abi'
import { Fixture } from 'ethereum-waffle'
import { constants, Contract, ContractTransaction, Wallet } from 'ethers'
import { solidityPack } from 'ethers/lib/utils'
import { ethers, waffle } from 'hardhat'
import { MockTimeSwapRouter02, TestERC20 } from '../typechain'
import completeFixture from './shared/completeFixture'
import { ADDRESS_THIS, FeeAmount, TICK_SPACINGS } from './shared/constants'
import { encodePriceSqrt } from './shared/encodePriceSqrt'
import { expect } from './shared/expect'
import { encodePath } from './shared/path'
import { getMaxTick, getMinTick } from './shared/ticks'

enum ApprovalType {
  NOT_REQUIRED,
  MAX,
  MAX_MINUS_ONE,
  ZERO_THEN_MAX,
  ZERO_THEN_MAX_MINUS_ONE,
}

describe('ApproveAndCall', function () {
  this.timeout(40000)
  let wallet: Wallet
  let trader: Wallet

  const swapRouterFixture: Fixture<{
    factory: Contract
    router: MockTimeSwapRouter02
    nft: Contract
    tokens: [TestERC20, TestERC20, TestERC20]
  }> = async (wallets, provider) => {
    const { factory, router, tokens, nft } = await completeFixture(wallets, provider)

    // approve & fund wallets
    for (const token of tokens) {
      await token.approve(nft.address, constants.MaxUint256)
    }

    return {
      factory,
      router,
      tokens,
      nft,
    }
  }

  let factory: Contract
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
    ;({ factory, router, tokens, nft } = await loadFixture(swapRouterFixture))
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

    describe('approvals', () => {
      it('#approveMax', async () => {
        let approvalType = await router.callStatic.getApprovalType(tokens[0].address, 123)
        expect(approvalType).to.be.eq(ApprovalType.MAX)

        await router.approveMax(tokens[0].address)

        approvalType = await router.callStatic.getApprovalType(tokens[0].address, 123)
        expect(approvalType).to.be.eq(ApprovalType.NOT_REQUIRED)
      })

      it('#approveMax', async () => {
        await router.approveMax(tokens[0].address)
      })

      it('#approveMaxMinusOne', async () => {
        await router.approveMaxMinusOne(tokens[0].address)
      })

      describe('#approveZeroThenMax', async () => {
        it('from 0', async () => {
          await router.approveZeroThenMax(tokens[0].address)
        })
        it('from max', async () => {
          await router.approveMax(tokens[0].address)
          await router.approveZeroThenMax(tokens[0].address)
        })
      })

      describe('#approveZeroThenMax', async () => {
        it('from 0', async () => {
          await router.approveZeroThenMaxMinusOne(tokens[0].address)
        })
        it('from max', async () => {
          await router.approveMax(tokens[0].address)
          await router.approveZeroThenMaxMinusOne(tokens[0].address)
        })
      })
    })

    it('#mint and #increaseLiquidity', async () => {
      await createPool(tokens[0].address, tokens[1].address)
      const pool = await factory.getPool(tokens[0].address, tokens[1].address, FeeAmount.MEDIUM)

      // approve in advance
      await router.approveMax(tokens[0].address)
      await router.approveMax(tokens[1].address)

      // send dummy amount of tokens to the pair in advance
      const amount = 1000
      await tokens[0].transfer(router.address, amount)
      await tokens[1].transfer(router.address, amount)
      expect((await tokens[0].balanceOf(router.address)).toNumber()).to.be.eq(amount)
      expect((await tokens[1].balanceOf(router.address)).toNumber()).to.be.eq(amount)

      let poolBalance0Before = await tokens[0].balanceOf(pool)
      let poolBalance1Before = await tokens[1].balanceOf(pool)

      // perform the mint
      await router.mint({
        token0: tokens[0].address,
        token1: tokens[1].address,
        fee: FeeAmount.MEDIUM,
        tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        recipient: trader.address,
        amount0Min: 0,
        amount1Min: 0,
      })

      expect((await tokens[0].balanceOf(router.address)).toNumber()).to.be.eq(0)
      expect((await tokens[1].balanceOf(router.address)).toNumber()).to.be.eq(0)
      expect((await tokens[0].balanceOf(pool)).toNumber()).to.be.eq(poolBalance0Before.toNumber() + amount)
      expect((await tokens[1].balanceOf(pool)).toNumber()).to.be.eq(poolBalance1Before.toNumber() + amount)

      expect((await nft.balanceOf(trader.address)).toNumber()).to.be.eq(1)

      // send more tokens
      await tokens[0].transfer(router.address, amount)
      await tokens[1].transfer(router.address, amount)

      // perform the increaseLiquidity
      await router.increaseLiquidity({
        token0: tokens[0].address,
        token1: tokens[1].address,
        tokenId: 2,
        amount0Min: 0,
        amount1Min: 0,
      })

      expect((await tokens[0].balanceOf(router.address)).toNumber()).to.be.eq(0)
      expect((await tokens[1].balanceOf(router.address)).toNumber()).to.be.eq(0)
      expect((await tokens[0].balanceOf(pool)).toNumber()).to.be.eq(poolBalance0Before.toNumber() + amount * 2)
      expect((await tokens[1].balanceOf(pool)).toNumber()).to.be.eq(poolBalance1Before.toNumber() + amount * 2)

      expect((await nft.balanceOf(trader.address)).toNumber()).to.be.eq(1)
    })

    describe('single-asset add', () => {
      beforeEach('create 0-1 pool', async () => {
        await createPool(tokens[0].address, tokens[1].address)
      })

      async function singleAssetAddExactInput(
        tokenIn: string,
        tokenOut: string,
        amountIn: number,
        amountOutMinimum: number
      ): Promise<ContractTransaction> {
        // encode the exact input swap
        const params = {
          path: encodePath([tokenIn, tokenOut], [FeeAmount.MEDIUM]),
          recipient: ADDRESS_THIS, // have to send to the router, as it will be adding liquidity for the caller
          amountIn,
          amountOutMinimum,
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

      it('0 -> 1', async () => {
        const amountIn = 1000
        const amountOutMinimum = 996

        // prep for the swap + add by sending tokens
        await tokens[0].transfer(trader.address, amountIn + amountOutMinimum)
        await tokens[0].connect(trader).approve(router.address, amountIn + amountOutMinimum)

        const traderToken0BalanceBefore = await tokens[0].balanceOf(trader.address)
        const traderToken1BalanceBefore = await tokens[1].balanceOf(trader.address)
        expect(traderToken0BalanceBefore.toNumber()).to.be.eq(amountIn + amountOutMinimum)
        expect(traderToken1BalanceBefore.toNumber()).to.be.eq(0)

        const traderNFTBalanceBefore = await nft.balanceOf(trader.address)
        expect(traderNFTBalanceBefore.toNumber()).to.be.eq(0)

        await singleAssetAddExactInput(tokens[0].address, tokens[1].address, amountIn, amountOutMinimum)

        const traderToken0BalanceAfter = await tokens[0].balanceOf(trader.address)
        const traderToken1BalanceAfter = await tokens[1].balanceOf(trader.address)
        expect(traderToken0BalanceAfter.toNumber()).to.be.eq(0)
        expect(traderToken1BalanceAfter.toNumber()).to.be.eq(1) // dust

        const traderNFTBalanceAfter = await nft.balanceOf(trader.address)
        expect(traderNFTBalanceAfter.toNumber()).to.be.eq(1)
      })
    })

    describe('any-asset add', () => {
      beforeEach('create 0-1, 0-2, and 1-2 pools pools', async () => {
        await createPool(tokens[0].address, tokens[1].address)
        await createPool(tokens[0].address, tokens[2].address)
        await createPool(tokens[1].address, tokens[2].address)
      })

      async function anyAssetAddExactInput(
        tokenStart: string,
        tokenA: string,
        tokenB: string,
        amountIn: number,
        amountOutMinimum: number
      ): Promise<ContractTransaction> {
        // encode the exact input swaps
        let params = {
          path: encodePath([tokenStart, tokenA], [FeeAmount.MEDIUM]),
          recipient: ADDRESS_THIS, // have to send to the router, as it will be adding liquidity for the caller
          amountIn,
          amountOutMinimum,
        }
        // ensure that the swap fails if the limit is any tighter
        let amountOut = await router.connect(trader).callStatic.exactInput(params)
        expect(amountOut.toNumber()).to.be.eq(amountOutMinimum)
        let data = [router.interface.encodeFunctionData('exactInput', [params])]

        // encode the exact input swaps
        params = {
          path: encodePath([tokenStart, tokenB], [FeeAmount.MEDIUM]),
          recipient: ADDRESS_THIS, // have to send to the router, as it will be adding liquidity for the caller
          amountIn,
          amountOutMinimum,
        }
        // ensure that the swap fails if the limit is any tighter
        amountOut = await router.connect(trader).callStatic.exactInput(params)
        expect(amountOut.toNumber()).to.be.eq(amountOutMinimum)
        data.push(router.interface.encodeFunctionData('exactInput', [params]))

        // encode the approves
        data.push(router.interface.encodeFunctionData('approveMax', [tokenA]))
        data.push(router.interface.encodeFunctionData('approveMax', [tokenB]))

        // encode the add liquidity
        const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase() ? [tokenA, tokenB] : [tokenB, tokenA]
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
        data.push(encodeSweepToken(tokenA, 0))
        data.push(encodeSweepToken(tokenB, 0))

        return router.connect(trader)['multicall(bytes[])'](data)
      }

      it('0 -> 1 and 0 -> 2', async () => {
        const amountIn = 1000
        const amountOutMinimum = 996

        // prep for the swap + add by sending tokens
        await tokens[0].transfer(trader.address, amountIn * 2)
        await tokens[0].connect(trader).approve(router.address, amountIn * 2)

        const traderToken0BalanceBefore = await tokens[0].balanceOf(trader.address)
        const traderToken1BalanceBefore = await tokens[1].balanceOf(trader.address)
        const traderToken2BalanceBefore = await tokens[2].balanceOf(trader.address)
        expect(traderToken0BalanceBefore.toNumber()).to.be.eq(amountIn * 2)
        expect(traderToken1BalanceBefore.toNumber()).to.be.eq(0)
        expect(traderToken2BalanceBefore.toNumber()).to.be.eq(0)

        const traderNFTBalanceBefore = await nft.balanceOf(trader.address)
        expect(traderNFTBalanceBefore.toNumber()).to.be.eq(0)

        await anyAssetAddExactInput(tokens[0].address, tokens[1].address, tokens[2].address, amountIn, amountOutMinimum)

        const traderToken0BalanceAfter = await tokens[0].balanceOf(trader.address)
        const traderToken1BalanceAfter = await tokens[1].balanceOf(trader.address)
        const traderToken2BalanceAfter = await tokens[2].balanceOf(trader.address)
        expect(traderToken0BalanceAfter.toNumber()).to.be.eq(0)
        expect(traderToken1BalanceAfter.toNumber()).to.be.eq(0)
        expect(traderToken2BalanceAfter.toNumber()).to.be.eq(0)

        const traderNFTBalanceAfter = await nft.balanceOf(trader.address)
        expect(traderNFTBalanceAfter.toNumber()).to.be.eq(1)
      })
    })
  })
})
