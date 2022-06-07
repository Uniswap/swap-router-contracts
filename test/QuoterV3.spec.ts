import { Fixture } from 'ethereum-waffle'
import { constants, Wallet, Contract } from 'ethers'
import { ethers, waffle } from 'hardhat'
import { QuoterV3, TestERC20 } from '../typechain'
import completeFixture from './shared/completeFixture'
import { FeeAmount, MaxUint128 } from './shared/constants'
import { encodePriceSqrt } from './shared/encodePriceSqrt'
import { expandTo18Decimals } from './shared/expandTo18Decimals'
import { expect } from './shared/expect'
import { v2FactoryFixture } from './shared/externalFixtures'
import { encodePath, encodeProtocolFlags } from './shared/path'
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
    const pair02 = new Contract(pairAddress, PAIR_V2_ABI, wallet)
    expect(await pair02.callStatic.token0()).to.equal(token0.address)
    expect(await pair02.callStatic.token1()).to.equal(token1.address)
    // seed the pairs with liquidity
    await token0.transfer(pairAddress, ethers.utils.parseEther(amount0))
    await token1.transfer(pairAddress, ethers.utils.parseEther(amount1))

    expect(await token0.balanceOf(pairAddress)).to.equal(ethers.utils.parseEther(amount0))
    expect(await token1.balanceOf(pairAddress)).to.equal(ethers.utils.parseEther(amount1))

    const res = await pair02.callStatic.getReserves()
    console.log(res)
    await pair02.mint(wallet.address)
    console.log(await pair02.callStatic.getReserves())
  }

  describe.only('quotes', () => {
    beforeEach(async () => {
      await createPool(nft, wallet, tokens[0].address, tokens[1].address)
      await createPool(nft, wallet, tokens[1].address, tokens[2].address)
      await createPoolWithMultiplePositions(nft, wallet, tokens[0].address, tokens[2].address)
      /**
       * Create V2 pairs
       */
      const pair01Address = await createPair(factoryV2, tokens[0].address, tokens[1].address) // 0 - 1
      const pair12Address = await createPair(factoryV2, tokens[1].address, tokens[2].address) // 1 - 2
      const pair02Address = await createPair(factoryV2, tokens[0].address, tokens[2].address) // 0 - 2

      await addLiquidityV2(pair01Address, tokens[0], tokens[1], '1000000', '1000000')
      await addLiquidityV2(pair12Address, tokens[1], tokens[2], '1000000', '1000000')
      await addLiquidityV2(pair02Address, tokens[0], tokens[2], '1000000', '1000000')

      // TODO: how do we interact with the created pairs? we have the address
      // i dont think we deploy the pair contract using abi, we really just have to wrap it in the interface

      // need to call pair.sync() to update reserves
    })

    xdescribe('#quoteExactInput V3 only', () => {
      it('0 -> 2 cross 2 tick', async () => {
        const { amountOut, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoter.callStatic[
          'quoteExactInput(bytes,bytes,uint256)'
        ](encodePath([tokens[0].address, tokens[2].address], [FeeAmount.MEDIUM]), encodeProtocolFlags(['V3']), 10000)

        await snapshotGasCost(gasEstimate)
        expect(sqrtPriceX96AfterList.length).to.eq(1)
        expect(sqrtPriceX96AfterList[0]).to.eq('78461846509168490764501028180')
        expect(initializedTicksCrossedList[0]).to.eq(2)
        expect(amountOut).to.eq(9871)
      })

      it('0 -> 2 cross 2 tick where after is initialized', async () => {
        // The swap amount is set such that the active tick after the swap is -120.
        // -120 is an initialized tick for this pool. We check that we don't count it.
        const { amountOut, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoter.callStatic[
          'quoteExactInput(bytes,bytes,uint256)'
        ](encodePath([tokens[0].address, tokens[2].address], [FeeAmount.MEDIUM]), encodeProtocolFlags(['V3']), 6200)

        await snapshotGasCost(gasEstimate)
        expect(sqrtPriceX96AfterList.length).to.eq(1)
        expect(sqrtPriceX96AfterList[0]).to.eq('78757224507315167622282810783')
        expect(initializedTicksCrossedList.length).to.eq(1)
        expect(initializedTicksCrossedList[0]).to.eq(1)
        expect(amountOut).to.eq(6143)
      })

      it('0 -> 2 cross 1 tick', async () => {
        const { amountOut, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoter.callStatic[
          'quoteExactInput(bytes,bytes,uint256)'
        ](encodePath([tokens[0].address, tokens[2].address], [FeeAmount.MEDIUM]), encodeProtocolFlags(['V3']), 4000)

        await snapshotGasCost(gasEstimate)
        expect(initializedTicksCrossedList[0]).to.eq(1)
        expect(sqrtPriceX96AfterList.length).to.eq(1)
        expect(sqrtPriceX96AfterList[0]).to.eq('78926452400586371254602774705')
        expect(amountOut).to.eq(3971)
      })

      it('0 -> 2 cross 0 tick, starting tick not initialized', async () => {
        // Tick before 0, tick after -1.
        const { amountOut, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoter.callStatic[
          'quoteExactInput(bytes,bytes,uint256)'
        ](encodePath([tokens[0].address, tokens[2].address], [FeeAmount.MEDIUM]), encodeProtocolFlags(['V3']), 10)

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
          'quoteExactInput(bytes,bytes,uint256)'
        ](encodePath([tokens[0].address, tokens[2].address], [FeeAmount.MEDIUM]), encodeProtocolFlags(['V3']), 10)

        await snapshotGasCost(gasEstimate)
        expect(initializedTicksCrossedList[0]).to.eq(1)
        expect(sqrtPriceX96AfterList.length).to.eq(1)
        expect(sqrtPriceX96AfterList[0]).to.eq('79227817515327498931091950511')
        expect(amountOut).to.eq(8)
      })

      it('2 -> 0 cross 2', async () => {
        const { amountOut, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoter.callStatic[
          'quoteExactInput(bytes,bytes,uint256)'
        ](encodePath([tokens[2].address, tokens[0].address], [FeeAmount.MEDIUM]), encodeProtocolFlags(['V3']), 10000)

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
          'quoteExactInput(bytes,bytes,uint256)'
        ](encodePath([tokens[2].address, tokens[0].address], [FeeAmount.MEDIUM]), encodeProtocolFlags(['V3']), 6250)

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
          'quoteExactInput(bytes,bytes,uint256)'
        ](encodePath([tokens[2].address, tokens[0].address], [FeeAmount.MEDIUM]), encodeProtocolFlags(['V3']), 200)

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
          'quoteExactInput(bytes,bytes,uint256)'
        ](encodePath([tokens[2].address, tokens[0].address], [FeeAmount.MEDIUM]), encodeProtocolFlags(['V3']), 103)

        await snapshotGasCost(gasEstimate)
        expect(initializedTicksCrossedList[0]).to.eq(0)
        expect(sqrtPriceX96AfterList.length).to.eq(1)
        expect(sqrtPriceX96AfterList[0]).to.eq('79235858216754624215638319723')
        expect(initializedTicksCrossedList.length).to.eq(1)
        expect(amountOut).to.eq(101)
      })

      it('2 -> 1', async () => {
        const { amountOut, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoter.callStatic[
          'quoteExactInput(bytes,bytes,uint256)'
        ](encodePath([tokens[2].address, tokens[1].address], [FeeAmount.MEDIUM]), encodeProtocolFlags(['V3']), 10000)

        await snapshotGasCost(gasEstimate)
        expect(sqrtPriceX96AfterList.length).to.eq(1)
        expect(sqrtPriceX96AfterList[0]).to.eq('80018067294531553039351583520')
        expect(initializedTicksCrossedList[0]).to.eq(0)
        expect(amountOut).to.eq(9871)
      })

      it('0 -> 2 -> 1', async () => {
        const { amountOut, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoter.callStatic[
          'quoteExactInput(bytes,bytes,uint256)'
        ](
          encodePath([tokens[0].address, tokens[2].address, tokens[1].address], [FeeAmount.MEDIUM, FeeAmount.MEDIUM]),
          encodeProtocolFlags(['V3', 'V3']),
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

    describe('encodeProtocolFlags', () => {
      it('should encode the protocol flags', async () => {
        expect(encodeProtocolFlags(['V3', 'V2', 'V3', 'V3'])).to.equal('0x01000101')
      })
    })

    describe('#quoteExactInput V2 only', () => {
      it('0 -> 2 cross 2 tick', async () => {
        const { amountOut, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoter.callStatic[
          'quoteExactInput(bytes,bytes,uint256)'
        ](encodePath([tokens[0].address, tokens[2].address], [FeeAmount.MEDIUM]), encodeProtocolFlags(['V2']), 10000)

        await snapshotGasCost(gasEstimate)
        console.log(amountOut)
      })
    })
  })
})
