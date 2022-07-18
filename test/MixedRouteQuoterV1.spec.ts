import { Fixture } from 'ethereum-waffle'
import { constants, Wallet, Contract, BigNumber } from 'ethers'
import { ethers, waffle } from 'hardhat'
import { MixedRouteQuoterV1, TestERC20 } from '../typechain'
import completeFixture from './shared/completeFixture'
import { FeeAmount, V2_FEE_PLACEHOLDER } from './shared/constants'
import { encodePriceSqrt } from './shared/encodePriceSqrt'
import { expandTo18Decimals } from './shared/expandTo18Decimals'
import { expect } from './shared/expect'
import { encodePath } from './shared/path'
import {
  createPair,
  createPool,
  createPoolWithMultiplePositions,
  createPoolWithZeroTickInitialized,
} from './shared/quoter'
import snapshotGasCost from './shared/snapshotGasCost'

import { abi as PAIR_V2_ABI } from '@uniswap/v2-core/build/UniswapV2Pair.json'

const V3_MAX_FEE = 999999 // = 1_000_000 - 1 since must be < 1_000_000

describe('MixedRouteQuoterV1', function () {
  this.timeout(40000)
  let wallet: Wallet
  let trader: Wallet

  const swapRouterFixture: Fixture<{
    nft: Contract
    factoryV2: Contract
    tokens: [TestERC20, TestERC20, TestERC20]
    quoter: MixedRouteQuoterV1
  }> = async (wallets, provider) => {
    const { weth9, factory, factoryV2, router, tokens, nft } = await completeFixture(wallets, provider)

    // approve & fund wallets
    for (const token of tokens) {
      await token.approve(router.address, constants.MaxUint256)
      await token.approve(nft.address, constants.MaxUint256)
      await token.connect(trader).approve(router.address, constants.MaxUint256)
      await token.transfer(trader.address, expandTo18Decimals(1_000_000))
    }

    const quoterFactory = await ethers.getContractFactory('MixedRouteQuoterV1')
    quoter = (await quoterFactory.deploy(factory.address, factoryV2.address, weth9.address)) as MixedRouteQuoterV1

    return {
      tokens,
      nft,
      factoryV2,
      quoter,
    }
  }

  let nft: Contract
  let factoryV2: Contract
  let tokens: [TestERC20, TestERC20, TestERC20]
  let quoter: MixedRouteQuoterV1

  let pair01Address, pair02Address, pair12Address: string

  let loadFixture: ReturnType<typeof waffle.createFixtureLoader>

  before('create fixture loader', async () => {
    const wallets = await (ethers as any).getSigners()
    ;[wallet, trader] = wallets
    loadFixture = waffle.createFixtureLoader(wallets)
  })

  // helper for getting weth and token balances
  beforeEach('load fixture', async () => {
    ;({ tokens, nft, factoryV2, quoter } = await loadFixture(swapRouterFixture))
  })

  const addLiquidityV2 = async (
    pairAddress: string,
    token0: TestERC20,
    token1: TestERC20,
    amount0: string,
    amount1: string
  ) => {
    const pair = new Contract(pairAddress, PAIR_V2_ABI, wallet)
    expect(await pair.callStatic.token0()).to.equal(token0.address)
    expect(await pair.callStatic.token1()).to.equal(token1.address)
    // seed the pairs with liquidity

    const [reserve0Before, reserve1Before]: [BigNumber, BigNumber] = await pair.callStatic.getReserves()

    const token0BalanceBefore = await token0.balanceOf(pairAddress)
    const token1BalanceBefore = await token1.balanceOf(pairAddress)

    await token0.transfer(pairAddress, ethers.utils.parseEther(amount0))
    await token1.transfer(pairAddress, ethers.utils.parseEther(amount1))

    expect(await token0.balanceOf(pairAddress)).to.equal(token0BalanceBefore.add(ethers.utils.parseEther(amount0)))
    expect(await token1.balanceOf(pairAddress)).to.equal(token1BalanceBefore.add(ethers.utils.parseEther(amount1)))

    await pair.mint(wallet.address) // update the reserves

    const [reserve0, reserve1] = await pair.callStatic.getReserves()
    expect(reserve0).to.equal(reserve0Before.add(ethers.utils.parseEther(amount0)))
    expect(reserve1).to.equal(reserve1Before.add(ethers.utils.parseEther(amount1)))
  }

  describe('quotes', () => {
    beforeEach(async () => {
      await createPool(nft, wallet, tokens[0].address, tokens[1].address)
      await createPool(nft, wallet, tokens[1].address, tokens[2].address)
      await createPoolWithMultiplePositions(nft, wallet, tokens[0].address, tokens[2].address)
      /// @dev Create V2 Pairs
      pair01Address = await createPair(factoryV2, tokens[0].address, tokens[1].address)
      pair12Address = await createPair(factoryV2, tokens[1].address, tokens[2].address)
      pair02Address = await createPair(factoryV2, tokens[0].address, tokens[2].address)

      await addLiquidityV2(pair01Address, tokens[0], tokens[1], '1000000', '1000000')
      await addLiquidityV2(pair12Address, tokens[1], tokens[2], '1000000', '1000000')
      await addLiquidityV2(pair02Address, tokens[0], tokens[2], '1000000', '1000000')
    })

    /// @dev Test running the old suite on the new function but with protocolFlags only being V3[]
    describe('#quoteExactInput V3 only', () => {
      it('0 -> 2 cross 2 tick', async () => {
        const {
          amountOut,
          v3SqrtPriceX96AfterList,
          v3InitializedTicksCrossedList,
          v3SwapGasEstimate,
        } = await quoter.callStatic['quoteExactInput(bytes,uint256)'](
          encodePath([tokens[0].address, tokens[2].address], [FeeAmount.MEDIUM]),
          10000
        )

        expect(v3SqrtPriceX96AfterList.length).to.eq(1)
        expect(v3SqrtPriceX96AfterList[0]).to.eq('78461846509168490764501028180')
        expect(v3InitializedTicksCrossedList[0]).to.eq(2)
        expect(amountOut).to.eq(9871)
        await snapshotGasCost(v3SwapGasEstimate)
      })

      it('0 -> 2 cross 2 tick where after is initialized', async () => {
        // The swap amount is set such that the active tick after the swap is -120.
        // -120 is an initialized tick for this pool. We check that we don't count it.
        const {
          amountOut,
          v3SqrtPriceX96AfterList,
          v3InitializedTicksCrossedList,
          v3SwapGasEstimate,
        } = await quoter.callStatic['quoteExactInput(bytes,uint256)'](
          encodePath([tokens[0].address, tokens[2].address], [FeeAmount.MEDIUM]),
          6200
        )

        await snapshotGasCost(v3SwapGasEstimate)
        expect(v3SqrtPriceX96AfterList.length).to.eq(1)
        expect(v3SqrtPriceX96AfterList[0]).to.eq('78757224507315167622282810783')
        expect(v3InitializedTicksCrossedList.length).to.eq(1)
        expect(v3InitializedTicksCrossedList[0]).to.eq(1)
        expect(amountOut).to.eq(6143)
      })

      it('0 -> 2 cross 1 tick', async () => {
        const {
          amountOut,
          v3SqrtPriceX96AfterList,
          v3InitializedTicksCrossedList,
          v3SwapGasEstimate,
        } = await quoter.callStatic['quoteExactInput(bytes,uint256)'](
          encodePath([tokens[0].address, tokens[2].address], [FeeAmount.MEDIUM]),
          4000
        )

        await snapshotGasCost(v3SwapGasEstimate)
        expect(v3InitializedTicksCrossedList[0]).to.eq(1)
        expect(v3SqrtPriceX96AfterList.length).to.eq(1)
        expect(v3SqrtPriceX96AfterList[0]).to.eq('78926452400586371254602774705')
        expect(amountOut).to.eq(3971)
      })

      it('0 -> 2 cross 0 tick, starting tick not initialized', async () => {
        // Tick before 0, tick after -1.
        const {
          amountOut,
          v3SqrtPriceX96AfterList,
          v3InitializedTicksCrossedList,
          v3SwapGasEstimate,
        } = await quoter.callStatic['quoteExactInput(bytes,uint256)'](
          encodePath([tokens[0].address, tokens[2].address], [FeeAmount.MEDIUM]),
          10
        )

        await snapshotGasCost(v3SwapGasEstimate)
        expect(v3InitializedTicksCrossedList[0]).to.eq(0)
        expect(v3SqrtPriceX96AfterList.length).to.eq(1)
        expect(v3SqrtPriceX96AfterList[0]).to.eq('79227483487511329217250071027')
        expect(amountOut).to.eq(8)
      })

      it('0 -> 2 cross 0 tick, starting tick initialized', async () => {
        // Tick before 0, tick after -1. Tick 0 initialized.
        await createPoolWithZeroTickInitialized(nft, wallet, tokens[0].address, tokens[2].address)

        const {
          amountOut,
          v3SqrtPriceX96AfterList,
          v3InitializedTicksCrossedList,
          v3SwapGasEstimate,
        } = await quoter.callStatic['quoteExactInput(bytes,uint256)'](
          encodePath([tokens[0].address, tokens[2].address], [FeeAmount.MEDIUM]),
          10
        )

        await snapshotGasCost(v3SwapGasEstimate)
        expect(v3InitializedTicksCrossedList[0]).to.eq(1)
        expect(v3SqrtPriceX96AfterList.length).to.eq(1)
        expect(v3SqrtPriceX96AfterList[0]).to.eq('79227817515327498931091950511')
        expect(amountOut).to.eq(8)
      })

      it('2 -> 0 cross 2', async () => {
        const {
          amountOut,
          v3SqrtPriceX96AfterList,
          v3InitializedTicksCrossedList,
          v3SwapGasEstimate,
        } = await quoter.callStatic['quoteExactInput(bytes,uint256)'](
          encodePath([tokens[2].address, tokens[0].address], [FeeAmount.MEDIUM]),
          10000
        )

        await snapshotGasCost(v3SwapGasEstimate)
        expect(v3InitializedTicksCrossedList[0]).to.eq(2)
        expect(v3SqrtPriceX96AfterList.length).to.eq(1)
        expect(v3SqrtPriceX96AfterList[0]).to.eq('80001962924147897865541384515')
        expect(v3InitializedTicksCrossedList.length).to.eq(1)
        expect(amountOut).to.eq(9871)
      })

      it('2 -> 0 cross 2 where tick after is initialized', async () => {
        // The swap amount is set such that the active tick after the swap is 120.
        // 120 is an initialized tick for this pool. We check we don't count it.
        const {
          amountOut,
          v3SqrtPriceX96AfterList,
          v3InitializedTicksCrossedList,
          v3SwapGasEstimate,
        } = await quoter.callStatic['quoteExactInput(bytes,uint256)'](
          encodePath([tokens[2].address, tokens[0].address], [FeeAmount.MEDIUM]),
          6250
        )

        await snapshotGasCost(v3SwapGasEstimate)
        expect(v3InitializedTicksCrossedList[0]).to.eq(2)
        expect(v3SqrtPriceX96AfterList.length).to.eq(1)
        expect(v3SqrtPriceX96AfterList[0]).to.eq('79705728824507063507279123685')
        expect(v3InitializedTicksCrossedList.length).to.eq(1)
        expect(amountOut).to.eq(6190)
      })

      it('2 -> 0 cross 0 tick, starting tick initialized', async () => {
        // Tick 0 initialized. Tick after = 1
        await createPoolWithZeroTickInitialized(nft, wallet, tokens[0].address, tokens[2].address)

        const {
          amountOut,
          v3SqrtPriceX96AfterList,
          v3InitializedTicksCrossedList,
          v3SwapGasEstimate,
        } = await quoter.callStatic['quoteExactInput(bytes,uint256)'](
          encodePath([tokens[2].address, tokens[0].address], [FeeAmount.MEDIUM]),
          200
        )

        await snapshotGasCost(v3SwapGasEstimate)
        expect(v3InitializedTicksCrossedList[0]).to.eq(0)
        expect(v3SqrtPriceX96AfterList.length).to.eq(1)
        expect(v3SqrtPriceX96AfterList[0]).to.eq('79235729830182478001034429156')
        expect(v3InitializedTicksCrossedList.length).to.eq(1)
        expect(amountOut).to.eq(198)
      })

      it('2 -> 0 cross 0 tick, starting tick not initialized', async () => {
        // Tick 0 initialized. Tick after = 1
        const {
          amountOut,
          v3SqrtPriceX96AfterList,
          v3InitializedTicksCrossedList,
          v3SwapGasEstimate,
        } = await quoter.callStatic['quoteExactInput(bytes,uint256)'](
          encodePath([tokens[2].address, tokens[0].address], [FeeAmount.MEDIUM]),
          103
        )

        await snapshotGasCost(v3SwapGasEstimate)
        expect(v3InitializedTicksCrossedList[0]).to.eq(0)
        expect(v3SqrtPriceX96AfterList.length).to.eq(1)
        expect(v3SqrtPriceX96AfterList[0]).to.eq('79235858216754624215638319723')
        expect(v3InitializedTicksCrossedList.length).to.eq(1)
        expect(amountOut).to.eq(101)
      })

      it('2 -> 1', async () => {
        const {
          amountOut,
          v3SqrtPriceX96AfterList,
          v3InitializedTicksCrossedList,
          v3SwapGasEstimate,
        } = await quoter.callStatic['quoteExactInput(bytes,uint256)'](
          encodePath([tokens[2].address, tokens[1].address], [FeeAmount.MEDIUM]),
          10000
        )

        await snapshotGasCost(v3SwapGasEstimate)
        expect(v3SqrtPriceX96AfterList.length).to.eq(1)
        expect(v3SqrtPriceX96AfterList[0]).to.eq('80018067294531553039351583520')
        expect(v3InitializedTicksCrossedList[0]).to.eq(0)
        expect(amountOut).to.eq(9871)
      })

      it('0 -> 2 -> 1', async () => {
        const {
          amountOut,
          v3SqrtPriceX96AfterList,
          v3InitializedTicksCrossedList,
          v3SwapGasEstimate,
        } = await quoter.callStatic['quoteExactInput(bytes,uint256)'](
          encodePath([tokens[0].address, tokens[2].address, tokens[1].address], [FeeAmount.MEDIUM, FeeAmount.MEDIUM]),
          10000
        )

        await snapshotGasCost(v3SwapGasEstimate)
        expect(v3SqrtPriceX96AfterList.length).to.eq(2)
        expect(v3SqrtPriceX96AfterList[0]).to.eq('78461846509168490764501028180')
        expect(v3SqrtPriceX96AfterList[1]).to.eq('80007846861567212939802016351')
        expect(v3InitializedTicksCrossedList[0]).to.eq(2)
        expect(v3InitializedTicksCrossedList[1]).to.eq(0)
        expect(amountOut).to.eq(9745)
      })
    })

    /// @dev Test running the old suite on the new function but with protocolFlags only being V2[]
    describe('#quoteExactInput V2 only', () => {
      it('0 -> 2', async () => {
        const { amountOut, v3SwapGasEstimate } = await quoter.callStatic['quoteExactInput(bytes,uint256)'](
          encodePath([tokens[0].address, tokens[2].address], [V2_FEE_PLACEHOLDER]),
          10000
        )

        expect(amountOut).to.eq(9969)
      })

      it('0 -> 1 -> 2', async () => {
        const { amountOut, v3SwapGasEstimate } = await quoter.callStatic['quoteExactInput(bytes,uint256)'](
          encodePath(
            [tokens[0].address, tokens[1].address, tokens[2].address],
            [V2_FEE_PLACEHOLDER, V2_FEE_PLACEHOLDER]
          ),
          10000
        )

        expect(amountOut).to.eq(9939)
      })
    })

    /// @dev Test copied over from QuoterV2.spec.ts
    describe('#quoteExactInputSingle V3', () => {
      it('0 -> 2', async () => {
        const {
          amountOut: quote,
          sqrtPriceX96After,
          initializedTicksCrossed,
          gasEstimate,
        } = await quoter.callStatic.quoteExactInputSingleV3({
          tokenIn: tokens[0].address,
          tokenOut: tokens[2].address,
          fee: FeeAmount.MEDIUM,
          amountIn: 10000,
          // -2%
          sqrtPriceLimitX96: encodePriceSqrt(100, 102),
        })

        await snapshotGasCost(gasEstimate)
        expect(initializedTicksCrossed).to.eq(2)
        expect(quote).to.eq(9871)
        expect(sqrtPriceX96After).to.eq('78461846509168490764501028180')
      })

      it('2 -> 0', async () => {
        const {
          amountOut: quote,
          sqrtPriceX96After,
          initializedTicksCrossed,
          gasEstimate,
        } = await quoter.callStatic.quoteExactInputSingleV3({
          tokenIn: tokens[2].address,
          tokenOut: tokens[0].address,
          fee: FeeAmount.MEDIUM,
          amountIn: 10000,
          // +2%
          sqrtPriceLimitX96: encodePriceSqrt(102, 100),
        })

        await snapshotGasCost(gasEstimate)
        expect(initializedTicksCrossed).to.eq(2)
        expect(quote).to.eq(9871)
        expect(sqrtPriceX96After).to.eq('80001962924147897865541384515')
      })
    })

    /// @dev Test the new function for fetching a single V2 pair quote on chain (exactIn)
    describe('#quoteExactInputSingleV2', () => {
      it('0 -> 2', async () => {
        const amountIn = 10000
        const tokenIn = tokens[0].address
        const tokenOut = tokens[2].address
        const quote = await quoter.callStatic.quoteExactInputSingleV2({ tokenIn, tokenOut, amountIn })

        expect(quote).to.eq(9969)
      })

      it('2 -> 0', async () => {
        const amountIn = 10000
        const tokenIn = tokens[2].address
        const tokenOut = tokens[0].address
        const quote = await quoter.callStatic.quoteExactInputSingleV2({ tokenIn, tokenOut, amountIn })

        expect(quote).to.eq(9969)
      })

      describe('+ with imbalanced pairs', () => {
        before(async () => {
          await addLiquidityV2(pair12Address, tokens[1], tokens[2], '1000000', '1000')
        })

        it('1 -> 2', async () => {
          const amountIn = 2_000_000
          const tokenIn = tokens[1].address
          const tokenOut = tokens[2].address
          const quote = await quoter.callStatic.quoteExactInputSingleV2({ tokenIn, tokenOut, amountIn })

          expect(quote).to.eq(1993999)
        })
      })
    })

    describe('testing bit masking for protocol selection', () => {
      it('when given the max v3 fee, should still route v3 and revert because pool DNE', async () => {
        /// @define 999999 is the max fee that can be set on a V3 pool per the factory
        ///       in this environment this pool does not exist, and thus the call should revert
        ///     - however, if the bitmask fails to catch this the call will succeed and route to V2
        ///     - thus, we expect it to be reverted.
        await expect(
          quoter.callStatic['quoteExactInput(bytes,uint256)'](
            encodePath([tokens[0].address, tokens[1].address], [V3_MAX_FEE]),
            10000
          )
        ).to.be.reverted
      })
    })
  })
})
