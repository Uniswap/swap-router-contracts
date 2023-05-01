import { defaultAbiCoder } from '@ethersproject/abi'
import { constants, ContractTransaction } from 'ethers'
import { Wallet, Contract } from 'zksync-web3'
import { solidityPack } from 'ethers/lib/utils'
import { MockTimeSwapRouter02, TestERC20 } from '../typechain'
import completeFixture from './shared/completeFixture'
import { ADDRESS_THIS, FeeAmount, TICK_SPACINGS } from './shared/constants'
import { encodePriceSqrt } from './shared/encodePriceSqrt'
import { expect } from './shared/expect'
import { encodePath } from './shared/path'
import { getMaxTick, getMinTick } from './shared/ticks'
import { getWallets } from './shared/zkSyncUtils'

enum ApprovalType {
  NOT_REQUIRED,
  MAX,
  MAX_MINUS_ONE,
  ZERO_THEN_MAX,
  ZERO_THEN_MAX_MINUS_ONE,
}

describe('ApproveAndCall', function () {
  let wallet: Wallet
  let trader: Wallet

  async function swapRouterFixture(wallets: Wallet[]): Promise<{
    factory: Contract
    router: MockTimeSwapRouter02
    nft: Contract
    tokens: [TestERC20, TestERC20, TestERC20]
  }> {
    const { factory, router, tokens, nft } = await completeFixture(wallets)
    // approve & fund wallets
    for (const token of tokens) {
      await (await token.approve(nft.address, constants.MaxUint256)).wait()
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

  function encodeSweepToken(token: string, amount: number) {
    const functionSignature = 'sweepToken(address,uint256)'
    return solidityPack(
      ['bytes4', 'bytes'],
      [router.interface.getSighash(functionSignature), defaultAbiCoder.encode(['address', 'uint256'], [token, amount])]
    )
  }

  before('create fixture loader', async () => {
    ;[wallet, trader] = await getWallets()
  })

  beforeEach('load fixture', async () => {
    ;({ factory, router, tokens, nft } = await swapRouterFixture([wallet, trader]))
  })

  describe('swap and add', () => {
    async function createPool(tokenAddressA: string, tokenAddressB: string) {
      if (tokenAddressA.toLowerCase() > tokenAddressB.toLowerCase())
        [tokenAddressA, tokenAddressB] = [tokenAddressB, tokenAddressA]

      await (await nft.createAndInitializePoolIfNecessary(
        tokenAddressA,
        tokenAddressB,
        FeeAmount.MEDIUM,
        encodePriceSqrt(1, 1)
      )).wait()

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

      return await (await nft.mint(liquidityParams)).wait()
    }

    describe('approvals', () => {
      it('#approveMax', async () => {
        let approvalType = await router.callStatic.getApprovalType(tokens[0].address, 123)
        expect(approvalType).to.be.eq(ApprovalType.MAX)

        await (await router.approveMax(tokens[0].address)).wait()

        approvalType = await router.callStatic.getApprovalType(tokens[0].address, 123)
        expect(approvalType).to.be.eq(ApprovalType.NOT_REQUIRED)
      })

      it('#approveMax', async () => {
        await (await router.approveMax(tokens[0].address)).wait()
      })

      it('#approveMaxMinusOne', async () => {
        await (await router.approveMaxMinusOne(tokens[0].address)).wait()
      })

      describe('#approveZeroThenMax', async () => {
        it('from 0', async () => {
          await (await router.approveZeroThenMax(tokens[0].address)).wait()
        })
        it('from max', async () => {
          await (await router.approveMax(tokens[0].address)).wait()
          await (await router.approveZeroThenMax(tokens[0].address)).wait()
        })
      })

      describe('#approveZeroThenMax', async () => {
        it('from 0', async () => {
          await (await router.approveZeroThenMaxMinusOne(tokens[0].address)).wait()
        })
        it('from max', async () => {
          await (await router.approveMax(tokens[0].address)).wait()
          await (await router.approveZeroThenMaxMinusOne(tokens[0].address)).wait()
        })
      })
    })

    it('#mint and #increaseLiquidity', async () => {
      await createPool(tokens[0].address, tokens[1].address)
      const pool = await factory.getPool(tokens[0].address, tokens[1].address, FeeAmount.MEDIUM)

      // approve in advance
      await (await router.approveMax(tokens[0].address)).wait()
      await (await router.approveMax(tokens[1].address)).wait()

      // send dummy amount of tokens to the pair in advance
      const amount = 1000
      await (await tokens[0].transfer(router.address, amount)).wait()
      await (await tokens[1].transfer(router.address, amount)).wait()
      expect((await tokens[0].balanceOf(router.address)).toNumber()).to.be.eq(amount)
      expect((await tokens[1].balanceOf(router.address)).toNumber()).to.be.eq(amount)

      let poolBalance0Before = await tokens[0].balanceOf(pool)
      let poolBalance1Before = await tokens[1].balanceOf(pool)

      // perform the mint
      await (await router.mint({
        token0: tokens[0].address,
        token1: tokens[1].address,
        fee: FeeAmount.MEDIUM,
        tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        recipient: trader.address,
        amount0Min: 0,
        amount1Min: 0,
      })).wait()

      expect((await tokens[0].balanceOf(router.address)).toNumber()).to.be.eq(0)
      expect((await tokens[1].balanceOf(router.address)).toNumber()).to.be.eq(0)
      expect((await tokens[0].balanceOf(pool)).toNumber()).to.be.eq(poolBalance0Before.toNumber() + amount)
      expect((await tokens[1].balanceOf(pool)).toNumber()).to.be.eq(poolBalance1Before.toNumber() + amount)

      expect((await nft.balanceOf(trader.address)).toNumber()).to.be.eq(1)

      // send more tokens
      await (await tokens[0].transfer(router.address, amount)).wait()
      await (await tokens[1].transfer(router.address, amount)).wait()

      // perform the increaseLiquidity
      await (await router.increaseLiquidity({
        token0: tokens[0].address,
        token1: tokens[1].address,
        tokenId: 2,
        amount0Min: 0,
        amount1Min: 0,
      })).wait()

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
        const amountOut = await router.connect(trader as any).callStatic.exactInput(params)
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

        return router.connect(trader as any)['multicall(bytes[])'](data)
      }

      it('0 -> 1', async () => {
        const amountIn = 1000
        const amountOutMinimum = 996

        // prep for the swap + add by sending tokens
        await (await tokens[0].transfer(trader.address, amountIn + amountOutMinimum)).wait()
        await (await tokens[0].connect(trader as any).approve(router.address, amountIn + amountOutMinimum)).wait()

        const traderToken0BalanceBefore = await tokens[0].balanceOf(trader.address)
        const traderToken1BalanceBefore = await tokens[1].balanceOf(trader.address)
        expect(traderToken0BalanceBefore.toNumber()).to.be.eq(amountIn + amountOutMinimum)
        expect(traderToken1BalanceBefore.toNumber()).to.be.eq(0)

        const traderNFTBalanceBefore = await nft.balanceOf(trader.address)
        expect(traderNFTBalanceBefore.toNumber()).to.be.eq(0)

        await (await singleAssetAddExactInput(tokens[0].address, tokens[1].address, amountIn, amountOutMinimum)).wait()

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
        let amountOut = await router.connect(trader as any).callStatic.exactInput(params)
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
        amountOut = await router.connect(trader as any).callStatic.exactInput(params)
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

        return router.connect(trader as any)['multicall(bytes[])'](data)
      }

      it('0 -> 1 and 0 -> 2', async () => {
        const amountIn = 1000
        const amountOutMinimum = 996

        // prep for the swap + add by sending tokens
        await (await tokens[0].transfer(trader.address, amountIn * 2)).wait()
        await (await tokens[0].connect(trader as any).approve(router.address, amountIn * 2)).wait()

        const traderToken0BalanceBefore = await tokens[0].balanceOf(trader.address)
        const traderToken1BalanceBefore = await tokens[1].balanceOf(trader.address)
        const traderToken2BalanceBefore = await tokens[2].balanceOf(trader.address)
        expect(traderToken0BalanceBefore.toNumber()).to.be.eq(amountIn * 2)
        expect(traderToken1BalanceBefore.toNumber()).to.be.eq(0)
        expect(traderToken2BalanceBefore.toNumber()).to.be.eq(0)

        const traderNFTBalanceBefore = await nft.balanceOf(trader.address)
        expect(traderNFTBalanceBefore.toNumber()).to.be.eq(0)

        await (await anyAssetAddExactInput(tokens[0].address, tokens[1].address, tokens[2].address, amountIn, amountOutMinimum)).wait()

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
