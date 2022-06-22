import { Fixture } from 'ethereum-waffle'
import { constants, Wallet, Contract, BigNumber } from 'ethers'
import { ethers, waffle } from 'hardhat'
import { QuoterV3, TestERC20 } from '../typechain'
import completeFixture from './shared/completeFixture'
import { FeeAmount, MaxUint128, V2_FEE } from './shared/constants'
import { encodePriceSqrt } from './shared/encodePriceSqrt'
import { expandTo18Decimals } from './shared/expandTo18Decimals'
import { expect } from './shared/expect'
import { v2FactoryFixture } from './shared/externalFixtures'
import { encodePath } from './shared/path'
import {
  createPair,
  createPool,
  createPoolWithMultiplePositions,
  createPoolWithZeroTickInitialized,
} from './shared/quoter'
import snapshotGasCost from './shared/snapshotGasCost'

import { abi as PAIR_V2_ABI, bytecode as PAIR_V2_BYTECODE } from '@uniswap/v2-core/build/UniswapV2Pair.json'

describe('QuoterV3', function () {
  this.timeout(40000)
  let wallet: Wallet
  let trader: Wallet

  const swapRouterFixture: Fixture<{
    nft: Contract
    factoryV2: Contract
    tokens: [TestERC20, TestERC20, TestERC20]
    quoter: QuoterV3
  }> = async (wallets, provider) => {
    const { weth9, factory, factoryV2, router, tokens, nft } = await completeFixture(wallets, provider)

    // approve & fund wallets
    for (const token of tokens) {
      await token.approve(router.address, constants.MaxUint256)
      await token.approve(nft.address, constants.MaxUint256)
      await token.connect(trader).approve(router.address, constants.MaxUint256)
      await token.transfer(trader.address, expandTo18Decimals(1_000_000))
    }

    const quoterFactory = await ethers.getContractFactory('QuoterV3')
    quoter = (await quoterFactory.deploy(factory.address, factoryV2.address, weth9.address)) as QuoterV3

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
  let quoter: QuoterV3

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
      /**
       * Create V2 pairs
       */
      pair01Address = await createPair(factoryV2, tokens[0].address, tokens[1].address) // 0 - 1
      pair12Address = await createPair(factoryV2, tokens[1].address, tokens[2].address) // 1 - 2
      pair02Address = await createPair(factoryV2, tokens[0].address, tokens[2].address) // 0 - 2

      await addLiquidityV2(pair01Address, tokens[0], tokens[1], '1000000', '1000000')
      await addLiquidityV2(pair12Address, tokens[1], tokens[2], '1000000', '1000000')
      await addLiquidityV2(pair02Address, tokens[0], tokens[2], '1000000', '1000000')
    })

    /// @dev Test running the old suite on the new function but with protocolFlags only being V3[]
    describe('#quoteExactInput V3 only', () => {
      it('0 -> 2 cross 2 tick', async () => {
        const { amountOut, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoter.callStatic[
          'quoteExactInput(bytes,uint256)'
        ](encodePath([tokens[0].address, tokens[2].address], [FeeAmount.MEDIUM]), 10000)

        expect(sqrtPriceX96AfterList.length).to.eq(1)
        expect(sqrtPriceX96AfterList[0]).to.eq('78461846509168490764501028180')
        expect(initializedTicksCrossedList[0]).to.eq(2)
        expect(amountOut).to.eq(9871)
        await snapshotGasCost(gasEstimate)
      })

      it('0 -> 2 cross 2 tick where after is initialized', async () => {
        // The swap amount is set such that the active tick after the swap is -120.
        // -120 is an initialized tick for this pool. We check that we don't count it.
        const { amountOut, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoter.callStatic[
          'quoteExactInput(bytes,uint256)'
        ](encodePath([tokens[0].address, tokens[2].address], [FeeAmount.MEDIUM]), 6200)

        await snapshotGasCost(gasEstimate)
        expect(sqrtPriceX96AfterList.length).to.eq(1)
        expect(sqrtPriceX96AfterList[0]).to.eq('78757224507315167622282810783')
        expect(initializedTicksCrossedList.length).to.eq(1)
        expect(initializedTicksCrossedList[0]).to.eq(1)
        expect(amountOut).to.eq(6143)
      })

      it('0 -> 2 cross 1 tick', async () => {
        const { amountOut, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoter.callStatic[
          'quoteExactInput(bytes,uint256)'
        ](encodePath([tokens[0].address, tokens[2].address], [FeeAmount.MEDIUM]), 4000)

        await snapshotGasCost(gasEstimate)
        expect(initializedTicksCrossedList[0]).to.eq(1)
        expect(sqrtPriceX96AfterList.length).to.eq(1)
        expect(sqrtPriceX96AfterList[0]).to.eq('78926452400586371254602774705')
        expect(amountOut).to.eq(3971)
      })

      it('0 -> 2 cross 0 tick, starting tick not initialized', async () => {
        // Tick before 0, tick after -1.
        const { amountOut, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoter.callStatic[
          'quoteExactInput(bytes,uint256)'
        ](encodePath([tokens[0].address, tokens[2].address], [FeeAmount.MEDIUM]), 10)

        await snapshotGasCost(gasEstimate)
        expect(initializedTicksCrossedList[0]).to.eq(0)
        expect(sqrtPriceX96AfterList.length).to.eq(1)
        expect(sqrtPriceX96AfterList[0]).to.eq('79227483487511329217250071027')
        expect(amountOut).to.eq(8)
      })

      it('0 -> 2 cross 0 tick, starting tick initialized', async () => {
        // Tick before 0, tick after -1. Tick 0 initialized.
        await createPoolWithZeroTickInitialized(nft, wallet, tokens[0].address, tokens[2].address)

        const { amountOut, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoter.callStatic[
          'quoteExactInput(bytes,uint256)'
        ](encodePath([tokens[0].address, tokens[2].address], [FeeAmount.MEDIUM]), 10)

        await snapshotGasCost(gasEstimate)
        expect(initializedTicksCrossedList[0]).to.eq(1)
        expect(sqrtPriceX96AfterList.length).to.eq(1)
        expect(sqrtPriceX96AfterList[0]).to.eq('79227817515327498931091950511')
        expect(amountOut).to.eq(8)
      })

      it('2 -> 0 cross 2', async () => {
        const { amountOut, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoter.callStatic[
          'quoteExactInput(bytes,uint256)'
        ](encodePath([tokens[2].address, tokens[0].address], [FeeAmount.MEDIUM]), 10000)

        await snapshotGasCost(gasEstimate)
        expect(initializedTicksCrossedList[0]).to.eq(2)
        expect(sqrtPriceX96AfterList.length).to.eq(1)
        expect(sqrtPriceX96AfterList[0]).to.eq('80001962924147897865541384515')
        expect(initializedTicksCrossedList.length).to.eq(1)
        expect(amountOut).to.eq(9871)
      })

      it('2 -> 0 cross 2 where tick after is initialized', async () => {
        // The swap amount is set such that the active tick after the swap is 120.
        // 120 is an initialized tick for this pool. We check we don't count it.
        const { amountOut, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoter.callStatic[
          'quoteExactInput(bytes,uint256)'
        ](encodePath([tokens[2].address, tokens[0].address], [FeeAmount.MEDIUM]), 6250)

        await snapshotGasCost(gasEstimate)
        expect(initializedTicksCrossedList[0]).to.eq(2)
        expect(sqrtPriceX96AfterList.length).to.eq(1)
        expect(sqrtPriceX96AfterList[0]).to.eq('79705728824507063507279123685')
        expect(initializedTicksCrossedList.length).to.eq(1)
        expect(amountOut).to.eq(6190)
      })

      it('2 -> 0 cross 0 tick, starting tick initialized', async () => {
        // Tick 0 initialized. Tick after = 1
        await createPoolWithZeroTickInitialized(nft, wallet, tokens[0].address, tokens[2].address)

        const { amountOut, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoter.callStatic[
          'quoteExactInput(bytes,uint256)'
        ](encodePath([tokens[2].address, tokens[0].address], [FeeAmount.MEDIUM]), 200)

        await snapshotGasCost(gasEstimate)
        expect(initializedTicksCrossedList[0]).to.eq(0)
        expect(sqrtPriceX96AfterList.length).to.eq(1)
        expect(sqrtPriceX96AfterList[0]).to.eq('79235729830182478001034429156')
        expect(initializedTicksCrossedList.length).to.eq(1)
        expect(amountOut).to.eq(198)
      })

      it('2 -> 0 cross 0 tick, starting tick not initialized', async () => {
        // Tick 0 initialized. Tick after = 1
        const { amountOut, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoter.callStatic[
          'quoteExactInput(bytes,uint256)'
        ](encodePath([tokens[2].address, tokens[0].address], [FeeAmount.MEDIUM]), 103)

        await snapshotGasCost(gasEstimate)
        expect(initializedTicksCrossedList[0]).to.eq(0)
        expect(sqrtPriceX96AfterList.length).to.eq(1)
        expect(sqrtPriceX96AfterList[0]).to.eq('79235858216754624215638319723')
        expect(initializedTicksCrossedList.length).to.eq(1)
        expect(amountOut).to.eq(101)
      })

      it('2 -> 1', async () => {
        const { amountOut, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoter.callStatic[
          'quoteExactInput(bytes,uint256)'
        ](encodePath([tokens[2].address, tokens[1].address], [FeeAmount.MEDIUM]), 10000)

        await snapshotGasCost(gasEstimate)
        expect(sqrtPriceX96AfterList.length).to.eq(1)
        expect(sqrtPriceX96AfterList[0]).to.eq('80018067294531553039351583520')
        expect(initializedTicksCrossedList[0]).to.eq(0)
        expect(amountOut).to.eq(9871)
      })

      it('0 -> 2 -> 1', async () => {
        const { amountOut, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoter.callStatic[
          'quoteExactInput(bytes,uint256)'
        ](
          encodePath([tokens[0].address, tokens[2].address, tokens[1].address], [FeeAmount.MEDIUM, FeeAmount.MEDIUM]),
          10000
        )

        await snapshotGasCost(gasEstimate)
        expect(sqrtPriceX96AfterList.length).to.eq(2)
        expect(sqrtPriceX96AfterList[0]).to.eq('78461846509168490764501028180')
        expect(sqrtPriceX96AfterList[1]).to.eq('80007846861567212939802016351')
        expect(initializedTicksCrossedList[0]).to.eq(2)
        expect(initializedTicksCrossedList[1]).to.eq(0)
        expect(amountOut).to.eq(9745)
      })
    })

    /// @dev Test running the old suite on the new function but with protocolFlags only being V2[]
    describe('#quoteExactInput V2 only', () => {
      it('0 -> 2', async () => {
        const { amountOut, gasEstimate } = await quoter.callStatic['quoteExactInput(bytes,uint256)'](
          encodePath([tokens[0].address, tokens[2].address], [V2_FEE]),
          10000
        )

        expect(amountOut).to.eq(9969)
      })

      it('0 -> 1 -> 2', async () => {
        const { amountOut, gasEstimate } = await quoter.callStatic['quoteExactInput(bytes,uint256)'](
          encodePath([tokens[0].address, tokens[1].address, tokens[2].address], [V2_FEE, V2_FEE]),
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
        } = await quoter.callStatic.quoteExactInputSingle({
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
        } = await quoter.callStatic.quoteExactInputSingle({
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
        const quote = await quoter.callStatic.quoteExactInputSingleV2(amountIn, tokenIn, tokenOut)

        expect(quote).to.eq(9969)
      })

      it('2 -> 0', async () => {
        const amountIn = 10000
        const tokenIn = tokens[2].address
        const tokenOut = tokens[0].address
        const quote = await quoter.callStatic.quoteExactInputSingleV2(amountIn, tokenIn, tokenOut)

        expect(quote).to.eq(9969)
      })

      describe('+ with imbalanced pairs', () => {
        before(async () => {
          // imbalance the 1-2 pool with a much larger amount in 1
          await addLiquidityV2(pair12Address, tokens[1], tokens[2], '1000000', '1000')
          // reservesAfter: 1: 2_000_000 , 2: 1_001_000
        })

        it('1 -> 2', async () => {
          const amountIn = 2_000_000
          const tokenIn = tokens[1].address
          const tokenOut = tokens[2].address
          const quote = await quoter.callStatic.quoteExactInputSingleV2(amountIn, tokenIn, tokenOut)

          expect(quote).to.eq(1993999)
        })
      })
    })

    /// @dev Test running the old suite on the new function but with protocolFlags only being V3[]
    describe('#quoteExactOutput V3 only', () => {
      it('0 -> 2 cross 2 tick', async () => {
        const { amountIn, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoter.callStatic[
          'quoteExactOutput(bytes,uint256)'
          // @note why do we need to flip the order of the tokens in the path for exactOut?
        ](encodePath([tokens[2].address, tokens[0].address], [FeeAmount.MEDIUM]), 15000)

        await snapshotGasCost(gasEstimate)
        expect(initializedTicksCrossedList.length).to.eq(1)
        expect(initializedTicksCrossedList[0]).to.eq(2)
        expect(amountIn).to.eq(15273)

        expect(sqrtPriceX96AfterList.length).to.eq(1)
        expect(sqrtPriceX96AfterList[0]).to.eq('78055527257643669242286029831')
      })

      it('0 -> 2 cross 2 where tick after is initialized', async () => {
        // The swap amount is set such that the active tick after the swap is -120.
        // -120 is an initialized tick for this pool. We check that we count it.
        const { amountIn, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoter.callStatic[
          'quoteExactOutput(bytes,uint256)'
        ](encodePath([tokens[2].address, tokens[0].address], [FeeAmount.MEDIUM]), 6143)

        await snapshotGasCost(gasEstimate)
        expect(sqrtPriceX96AfterList.length).to.eq(1)
        expect(sqrtPriceX96AfterList[0]).to.eq('78757225449310403327341205211')
        expect(initializedTicksCrossedList.length).to.eq(1)
        expect(initializedTicksCrossedList[0]).to.eq(1)
        expect(amountIn).to.eq(6200)
      })

      it('0 -> 2 cross 1 tick', async () => {
        const { amountIn, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoter.callStatic[
          'quoteExactOutput(bytes,uint256)'
        ](encodePath([tokens[2].address, tokens[0].address], [FeeAmount.MEDIUM]), 4000)

        await snapshotGasCost(gasEstimate)
        expect(initializedTicksCrossedList.length).to.eq(1)
        expect(initializedTicksCrossedList[0]).to.eq(1)
        expect(amountIn).to.eq(4029)

        expect(sqrtPriceX96AfterList.length).to.eq(1)
        expect(sqrtPriceX96AfterList[0]).to.eq('78924219757724709840818372098')
      })

      it('0 -> 2 cross 0 tick starting tick initialized', async () => {
        // Tick before 0, tick after 1. Tick 0 initialized.
        await createPoolWithZeroTickInitialized(nft, wallet, tokens[0].address, tokens[2].address)
        const { amountIn, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoter.callStatic[
          'quoteExactOutput(bytes,uint256)'
        ](encodePath([tokens[2].address, tokens[0].address], [FeeAmount.MEDIUM]), 100)

        await snapshotGasCost(gasEstimate)
        expect(initializedTicksCrossedList.length).to.eq(1)
        expect(initializedTicksCrossedList[0]).to.eq(1)
        expect(amountIn).to.eq(102)

        expect(sqrtPriceX96AfterList.length).to.eq(1)
        expect(sqrtPriceX96AfterList[0]).to.eq('79224329176051641448521403903')
      })

      it('0 -> 2 cross 0 tick starting tick not initialized', async () => {
        const { amountIn, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoter.callStatic[
          'quoteExactOutput(bytes,uint256)'
        ](encodePath([tokens[2].address, tokens[0].address], [FeeAmount.MEDIUM]), 10)

        await snapshotGasCost(gasEstimate)
        expect(initializedTicksCrossedList.length).to.eq(1)
        expect(initializedTicksCrossedList[0]).to.eq(0)
        expect(amountIn).to.eq(12)

        expect(sqrtPriceX96AfterList.length).to.eq(1)
        expect(sqrtPriceX96AfterList[0]).to.eq('79227408033628034983534698435')
      })

      it('2 -> 0 cross 2 ticks', async () => {
        const { amountIn, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoter.callStatic[
          'quoteExactOutput(bytes,uint256)'
        ](encodePath([tokens[0].address, tokens[2].address], [FeeAmount.MEDIUM]), 15000)

        await snapshotGasCost(gasEstimate)
        expect(initializedTicksCrossedList.length).to.eq(1)
        expect(initializedTicksCrossedList[0]).to.eq(2)
        expect(amountIn).to.eq(15273)
        expect(sqrtPriceX96AfterList.length).to.eq(1)
        expect(sqrtPriceX96AfterList[0]).to.eq('80418414376567919517220409857')
      })

      it('2 -> 0 cross 2 where tick after is initialized', async () => {
        // The swap amount is set such that the active tick after the swap is 120.
        // 120 is an initialized tick for this pool. We check that we don't count it.
        const { amountIn, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoter.callStatic[
          'quoteExactOutput(bytes,uint256)'
        ](encodePath([tokens[0].address, tokens[2].address], [FeeAmount.MEDIUM]), 6223)

        await snapshotGasCost(gasEstimate)
        expect(initializedTicksCrossedList[0]).to.eq(2)
        expect(sqrtPriceX96AfterList.length).to.eq(1)
        expect(sqrtPriceX96AfterList[0]).to.eq('79708304437530892332449657932')
        expect(initializedTicksCrossedList.length).to.eq(1)
        expect(amountIn).to.eq(6283)
      })

      it('2 -> 0 cross 1 tick', async () => {
        const { amountIn, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoter.callStatic[
          'quoteExactOutput(bytes,uint256)'
        ](encodePath([tokens[0].address, tokens[2].address], [FeeAmount.MEDIUM]), 6000)

        await snapshotGasCost(gasEstimate)
        expect(initializedTicksCrossedList[0]).to.eq(1)
        expect(sqrtPriceX96AfterList.length).to.eq(1)
        expect(sqrtPriceX96AfterList[0]).to.eq('79690640184021170956740081887')
        expect(initializedTicksCrossedList.length).to.eq(1)
        expect(amountIn).to.eq(6055)
      })

      it('2 -> 1', async () => {
        const { amountIn, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoter.callStatic[
          'quoteExactOutput(bytes,uint256)'
        ](encodePath([tokens[1].address, tokens[2].address], [FeeAmount.MEDIUM]), 9871)

        await snapshotGasCost(gasEstimate)
        expect(sqrtPriceX96AfterList.length).to.eq(1)
        expect(sqrtPriceX96AfterList[0]).to.eq('80018020393569259756601362385')
        expect(initializedTicksCrossedList[0]).to.eq(0)
        expect(amountIn).to.eq(10000)
      })

      it('0 -> 2 -> 1', async () => {
        const { amountIn, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoter.callStatic[
          'quoteExactOutput(bytes,uint256)'
        ](
          encodePath([tokens[0].address, tokens[2].address, tokens[1].address].reverse(), [
            FeeAmount.MEDIUM,
            FeeAmount.MEDIUM,
          ]),

          9745
        )

        await snapshotGasCost(gasEstimate)
        expect(sqrtPriceX96AfterList.length).to.eq(2)
        expect(sqrtPriceX96AfterList[0]).to.eq('80007838904387594703933785072')
        expect(sqrtPriceX96AfterList[1]).to.eq('78461888503179331029803316753')
        expect(initializedTicksCrossedList[0]).to.eq(0)
        expect(initializedTicksCrossedList[1]).to.eq(2)
        expect(amountIn).to.eq(10000)
      })
    })

    /// @dev Test running the old suite on the new function but with protocolFlags only being V2[]
    describe('#quoteExactOutput V2 only', () => {
      it('0 -> 2', async () => {
        const { amountIn } = await quoter.callStatic['quoteExactOutput(bytes,uint256)'](
          encodePath([tokens[0].address, tokens[2].address], [V2_FEE]),
          10000
        )

        expect(amountIn).to.eq(10031)
      })

      it('0 -> 1 -> 2', async () => {
        const { amountIn } = await quoter.callStatic['quoteExactOutput(bytes,uint256)'](
          encodePath([tokens[0].address, tokens[1].address, tokens[2].address], [V2_FEE, V2_FEE]),
          10000
        )

        expect(amountIn).to.eq(10062)
      })
    })

    /// @dev Test copied over from QuoterV2.spec.ts
    describe('#quoteExactOutputSingle V3', () => {
      it('0 -> 1', async () => {
        const {
          amountIn,
          sqrtPriceX96After,
          initializedTicksCrossed,
          gasEstimate,
        } = await quoter.callStatic.quoteExactOutputSingle({
          tokenIn: tokens[0].address,
          tokenOut: tokens[1].address,
          fee: FeeAmount.MEDIUM,
          amount: MaxUint128,
          sqrtPriceLimitX96: encodePriceSqrt(100, 102),
        })

        await snapshotGasCost(gasEstimate)
        expect(amountIn).to.eq(9981)
        expect(initializedTicksCrossed).to.eq(0)
        expect(sqrtPriceX96After).to.eq('78447570448055484695608110440')
      })

      it('1 -> 0', async () => {
        const {
          amountIn,
          sqrtPriceX96After,
          initializedTicksCrossed,
          gasEstimate,
        } = await quoter.callStatic.quoteExactOutputSingle({
          tokenIn: tokens[1].address,
          tokenOut: tokens[0].address,
          fee: FeeAmount.MEDIUM,
          amount: MaxUint128,
          sqrtPriceLimitX96: encodePriceSqrt(102, 100),
        })

        await snapshotGasCost(gasEstimate)
        expect(amountIn).to.eq(9981)
        expect(initializedTicksCrossed).to.eq(0)
        expect(sqrtPriceX96After).to.eq('80016521857016594389520272648')
      })
    })

    /// @dev Test the new function for fetching a single V2 pair quote on chain (exactOut)
    describe('#quoteExactOutputSingleV2', () => {
      it('0 -> 1', async () => {
        const amountOut = 10000
        const tokenIn = tokens[0].address
        const tokenOut = tokens[1].address
        const amountIn = await quoter.callStatic.quoteExactOutputSingleV2(amountOut, tokenIn, tokenOut)

        expect(amountIn).to.eq(10031)
      })

      /// @dev I think V2 pairs are symetrical
      it('1 -> 0', async () => {
        const amountOut = 10000
        const tokenIn = tokens[1].address
        const tokenOut = tokens[0].address
        const amountIn = await quoter.callStatic.quoteExactOutputSingleV2(amountOut, tokenIn, tokenOut)

        expect(amountIn).to.eq(10031)
      })
    })

    /// @dev Test interleaving routes for exactIn
    describe('#quoteExactInput V2+V3 mixed route', () => {
      it('0 -V3-> 2 -V2-> 1', async () => {
        const { amountOut, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoter.callStatic[
          'quoteExactInput(bytes,uint256)'
        ](encodePath([tokens[0].address, tokens[2].address, tokens[1].address], [FeeAmount.MEDIUM, V2_FEE]), 10000)

        await snapshotGasCost(gasEstimate)
        expect(sqrtPriceX96AfterList.length).to.eq(2)
        expect(sqrtPriceX96AfterList[0]).to.eq('78461846509168490764501028180')
        // expect the v2 part to have 0 for sqrt price for now
        expect(sqrtPriceX96AfterList[1]).to.eq('0')
        expect(initializedTicksCrossedList[0]).to.eq(2)
        // don't check V2 initializedTicksCrossList index
        expect(amountOut).to.eq(9841)
      })

      it('0 -V2-> 2 -V3-> 1', async () => {
        const { amountOut, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoter.callStatic[
          'quoteExactInput(bytes,uint256)'
        ](encodePath([tokens[0].address, tokens[2].address, tokens[1].address], [V2_FEE, FeeAmount.MEDIUM]), 10000)

        await snapshotGasCost(gasEstimate)
        expect(sqrtPriceX96AfterList.length).to.eq(2)
        // expect the v2 part to have 0 for sqrt price for now
        expect(sqrtPriceX96AfterList[0]).to.eq('0')
        /**
         * I think it's expected that the sqrtPriceAfter for the 2-1 V3 pool is different if the part before changed from V3 to V2
         * since the V2 pair likely had a different output than the V3 pool, which was used as input to the final V3 pool.
         */
        expect(sqrtPriceX96AfterList[1]).to.eq('80015611221493610844886183658') // @note this value is different from test above, compareTo: 80007846861567212939802016351
        // don't check V2 initializedTicksCrossList index
        expect(initializedTicksCrossedList[1]).to.eq(0)
        expect(amountOut).to.eq(9841)
      })
    })

    /// @dev Test interleaving routes for exactOut
    describe('#quoteExactOutput V2+V3 mixed route', () => {
      it('0 -V3-> 2 -V2-> 1', async () => {
        const { amountIn, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoter.callStatic[
          'quoteExactOutput(bytes,uint256)'
        ](encodePath([tokens[2].address, tokens[0].address, tokens[1].address], [FeeAmount.MEDIUM, V2_FEE]), 15000)

        // await snapshotGasCost(gasEstimate)
        expect(sqrtPriceX96AfterList.length).to.eq(2)
        expect(sqrtPriceX96AfterList[0]).to.eq('78055527257643669242286029831')
        // expect the v2 part to have 0 for sqrt price for now
        expect(sqrtPriceX96AfterList[1]).to.eq('0')
        expect(initializedTicksCrossedList[0]).to.eq(2)
        // don't check V2 initializedTicksCrossList index
        expect(amountIn).to.eq(15319)
      })
    })

    describe('testing bit masking for protocol selection', () => {
      it('when given the max v3 fee, should still route v3 and revert because pool DNE', async () => {
        /**
         * @dev this is the max fee that can be set on a V3 pool per the factory
         *      in this environment this pool does not exist, and thus the call should revert
         *      - however, if the bitmask fails to catch this and routes it to V2, it will succeed.
         *        thus, we expect it to be reverted.
         */
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
