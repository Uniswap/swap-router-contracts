import { Fixture } from 'ethereum-waffle'
import { BigNumber, constants, Contract, ContractTransaction, Wallet, utils } from 'ethers'
import { Interface } from '@ethersproject/abi'
import { waffle, ethers } from 'hardhat'
import { IWETH9, MockTimeSwapRouter02, TestERC20, TestPositionValue } from '../typechain'
import completeFixture from './shared/completeFixture'
import { encodePriceSqrt } from './shared/encodePriceSqrt'
import { expandTo18Decimals } from './shared/expandTo18Decimals'
import { expect } from './shared/expect'
import { encodePath } from './shared/path'
import { getMaxTick, getMinTick } from './shared/ticks'
import { defaultAbiCoder } from '@ethersproject/abi'
import { solidityPack } from 'ethers/lib/utils'
import { SwapRouter, RouteV2, RouteV3, Trade } from '@emag3m/router-sdk'
import { sqrt, Token, Currency, CurrencyAmount, TradeType, WETH9, Ether, Percent, Price } from '@uniswap/sdk-core'
import {
  AddLiquidityOptions,
  MethodParameters,
  Route as V3RouteSDK,
  FeeAmount,
  TICK_SPACINGS,
  Pool,
  Position,
  TickMath,
  nearestUsableTick,
  encodeSqrtRatioX96,
} from '@uniswap/v3-sdk'
import JSBI from 'jsbi'

import PositionValueJSON from '@uniswap/v3-periphery/artifacts/contracts/libraries/PositionValue.sol/PositionValue.json'

const toWei = (n: string) => utils.parseEther(n).toString()
const ADDRESS_THIS = '0x0000000000000000000000000000000000000001'
const TOKEN_LIQUIDITY_AMOUNT = toWei('1000000')

describe.only('router-sdk integration', function () {
  let wallet: Wallet
  let trader: Wallet

  const swapRouterFixture: Fixture<{
    weth9: IWETH9
    factory: Contract
    factoryV2: Contract
    router: MockTimeSwapRouter02
    nft: Contract
    tokens: [TestERC20, TestERC20, TestERC20]
  }> = async (wallets, provider) => {
    const { weth9, factory, factoryV2, router, tokens, nft } = await completeFixture(wallets, provider)

    // approve & fund wallets
    for (const token of tokens) {
      await token.approve(router.address, constants.MaxUint256)
      await token.approve(nft.address, constants.MaxUint256)
      await token.connect(trader).approve(router.address, constants.MaxUint256)
      await token.transfer(trader.address, expandTo18Decimals(1_000_000))
    }

    return {
      weth9,
      factory,
      factoryV2,
      router,
      tokens,
      nft,
    }
  }

  async function createPool(tokenAddressA: string, tokenAddressB: string) {
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
      amount0Desired: TOKEN_LIQUIDITY_AMOUNT,
      amount1Desired: TOKEN_LIQUIDITY_AMOUNT,
      amount0Min: 0,
      amount1Min: 0,
      deadline: 2 ** 32,
    }

    return nft.mint(liquidityParams)
  }

  function currencyAmount(amount: string, token: Token): CurrencyAmount<Token> {
    return CurrencyAmount.fromRawAmount(token, amount)
  }

  let factory: Contract
  let factoryV2: Contract
  let weth9: IWETH9
  let router: MockTimeSwapRouter02
  let nft: Contract
	let positionValue: TestPositionValue
  let tokens: [TestERC20, TestERC20, TestERC20]

  let loadFixture: ReturnType<typeof waffle.createFixtureLoader>

  function v2StylePool(
    reserve0: CurrencyAmount<Token>,
    reserve1: CurrencyAmount<Token>,
    feeAmount: FeeAmount = FeeAmount.MEDIUM
  ) {
    const sqrtRatioX96 = encodeSqrtRatioX96(reserve1.quotient, reserve0.quotient)
    const liquidity = sqrt(JSBI.multiply(reserve0.quotient, reserve1.quotient))
    return new Pool(
      reserve0.currency,
      reserve1.currency,
      feeAmount,
      sqrtRatioX96,
      liquidity,
      TickMath.getTickAtSqrtRatio(sqrtRatioX96),
      [
        {
          index: nearestUsableTick(TickMath.MIN_TICK, TICK_SPACINGS[feeAmount]),
          liquidityNet: liquidity,
          liquidityGross: liquidity,
        },
        {
          index: nearestUsableTick(TickMath.MAX_TICK, TICK_SPACINGS[feeAmount]),
          liquidityNet: JSBI.multiply(liquidity, JSBI.BigInt(-1)),
          liquidityGross: liquidity,
        },
      ]
    )
  }

  before('create fixture loader', async () => {
    ;[wallet, trader] = await (ethers as any).getSigners()
    loadFixture = waffle.createFixtureLoader([wallet, trader])
  })

  beforeEach('load fixture', async () => {
    ;({ router, tokens, nft, factory } = await loadFixture(swapRouterFixture))
		const positionValueFactory = await ethers.getContractFactory('TestPositionValue')
		positionValue = await positionValueFactory.deploy() as TestPositionValue
  })

  describe('swap and add', () => {
    let token0: Token
    let token1: Token
    let token2: Token

    let pool_0_1: Pool
    let pool_1_2: Pool
    let pool_0_2: Pool

		let position: Position
    let methodParameters: MethodParameters

    beforeEach('create on-chain contracts', async () => {
      await createPool(tokens[0].address, tokens[1].address)
      await createPool(tokens[1].address, tokens[2].address)
			await createPool(tokens[0].address, tokens[2].address)
    })

    beforeEach('create sdk components', async () => {
      token0 = new Token(1, tokens[0].address, 18)
      token1 = new Token(1, tokens[1].address, 18)
      token2 = new Token(1, tokens[2].address, 18)

      pool_0_1 = v2StylePool(
        CurrencyAmount.fromRawAmount(token0, TOKEN_LIQUIDITY_AMOUNT),
        CurrencyAmount.fromRawAmount(token1, TOKEN_LIQUIDITY_AMOUNT)
      )

      pool_1_2 = v2StylePool(
        CurrencyAmount.fromRawAmount(token1, TOKEN_LIQUIDITY_AMOUNT),
        CurrencyAmount.fromRawAmount(token2, TOKEN_LIQUIDITY_AMOUNT)
      )

      pool_0_2 = v2StylePool(
        CurrencyAmount.fromRawAmount(token0, TOKEN_LIQUIDITY_AMOUNT),
        CurrencyAmount.fromRawAmount(token2, TOKEN_LIQUIDITY_AMOUNT)
      )

      // setup trade components
      const slippageTolerance = new Percent(1)
      const routeOriginal = new V3RouteSDK([pool_0_1, pool_1_2], token0, token2)
      const route = new RouteV3(routeOriginal)
      const amount = CurrencyAmount.fromRawAmount(token0, toWei('1'))
      const tradeType = TradeType.EXACT_INPUT
      const expectedOut = await pool_0_1.getOutputAmount(amount)
      const trade = await Trade.fromRoute(route, amount, tradeType)

      // setup position components
      position = Position.fromAmounts({
				pool: pool_0_2,
        tickLower: -60,
        tickUpper: 60,
				amount0: toWei('1'),
				amount1: toWei('1'),
				useFullPrecision: true
			})
      const addLiquidityOptions = {
        recipient: wallet.address,
        slippageTolerance,
        deadline: 2 ** 32,
      }

      methodParameters = SwapRouter.swapAndAddCallParameters(
        trade,
        { slippageTolerance },
        position,
        addLiquidityOptions
      )
    })

    it('returns encoded calldata', async () => {
      expect(methodParameters.calldata).to.equal(
        '0xac9650d8000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000026000000000000000000000000000000000000000000000000000000000000002e0000000000000000000000000000000000000000000000000000000000000036000000000000000000000000000000000000000000000000000000000000003c00000000000000000000000000000000000000000000000000000000000000420000000000000000000000000000000000000000000000000000000000000062000000000000000000000000000000000000000000000000000000000000006a00000000000000000000000000000000000000000000000000000000000000124b858183f0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a764000000000000000000000000000000000000000000000000000006e5b60f3d2e9d6600000000000000000000000000000000000000000000000000000000000000420165878a594ca255338adfa4d48449f69242eb8f000bb85fc8d32690cc91d4c39d9d3abcbd16989f875707000bb8a513e6e4b8f2a923d98304ec87f64353c4d5c853000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000044f2d5d56b000000000000000000000000a513e6e4b8f2a923d98304ec87f64353c4d5c85300000000000000000000000000000000000000000000000006fb00a46a35629a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000044f2d5d56b0000000000000000000000000165878a594ca255338adfa4d48449f69242eb8f0000000000000000000000000000000000000000000000000de0b6b3a7640000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000024571ac8b00000000000000000000000000165878a594ca255338adfa4d48449f69242eb8f000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000024571ac8b0000000000000000000000000a513e6e4b8f2a923d98304ec87f64353c4d5c8530000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001c4b3a2af1300000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000164883164560000000000000000000000000165878a594ca255338adfa4d48449f69242eb8f000000000000000000000000a513e6e4b8f2a923d98304ec87f64353c4d5c8530000000000000000000000000000000000000000000000000000000000000bb8ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc4000000000000000000000000000000000000000000000000000000000000003c0000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000de0b6b3a764000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb92266000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000044e90a182f0000000000000000000000000165878a594ca255338adfa4d48449f69242eb8f0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000044e90a182f000000000000000000000000a513e6e4b8f2a923d98304ec87f64353c4d5c853000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'
      )
    })

    it('reverts if tokens are not approved to the router', async () => {
			await tokens[0].approve(router.address, 0)
			await expect(router['multicall(bytes[])']([methodParameters.calldata], { value: 0 })).to.be.revertedWith('STF')
		})


    it('mints the correct position', async () => {
			const [token_0, token_1] = tokens[0].address < tokens[2].address ? [tokens[0], tokens[2]] : [tokens[2], tokens[0]]
			const poolAddress = await factory.getPool(tokens[0].address, tokens[2].address, FeeAmount.MEDIUM)
			const tokenId = 4

			await expect(nft.positions(tokenId)).to.be.revertedWith(
				"VM Exception while processing transaction: revert Invalid token ID"
			)
			await router['multicall(bytes[])']([methodParameters.calldata], { value: 0 })

			const mintedPosition = await nft.positions(tokenId)
			expect(mintedPosition.tickLower).to.equal(position.tickLower)
			expect(mintedPosition.tickUpper).to.equal(position.tickUpper)
			expect(mintedPosition.token0).to.equal(token_0.address)
			expect(mintedPosition.token1).to.equal(token_1.address)
			expect(mintedPosition.liquidity.toString()).to.equal(position.liquidity.toString())
			expect(await nft.ownerOf(tokenId)).to.equal(wallet.address)
		})

		it('distributes token balances correctly', async () => {
			const [token_0, token_1] = tokens[0].address < tokens[2].address ? [tokens[0], tokens[2]] : [tokens[2], tokens[0]]
			const poolAddress = await factory.getPool(tokens[0].address, tokens[2].address, FeeAmount.MEDIUM)
			const tokenId = 4

			const poolBalancePrev0 = await tokens[0].balanceOf(poolAddress)
			const poolBalancePrev2 = await tokens[2].balanceOf(poolAddress)

			await router['multicall(bytes[])']([methodParameters.calldata], { value: 0 })

			const poolBalanceCurrent0 = await tokens[0].balanceOf(poolAddress)
			const poolBalanceCurrent2= await tokens[2].balanceOf(poolAddress)

			expect(poolBalanceCurrent0.sub(poolBalancePrev0)).to.equal(toWei('1'))
			expect(poolBalanceCurrent2.sub(poolBalancePrev2)).to.equal(toWei('1'))
		})
  })
})
