import { defaultAbiCoder } from '@ethersproject/abi'
import { abi as PAIR_V2_ABI } from '@uniswap/v2-core/build/UniswapV2Pair.json'
import { Fixture } from 'ethereum-waffle'
import { BigNumber, constants, Contract, ContractTransaction, Wallet } from 'ethers'
import { solidityPack } from 'ethers/lib/utils'
import { ethers, waffle } from 'hardhat'
import { IUniswapV2Pair, IWETH9, MockTimeSwapRouter02, MixedRouteQuoterV1, TestERC20 } from '../typechain'
import completeFixture from './shared/completeFixture'
import { computePoolAddress } from './shared/computePoolAddress'
import {
  ADDRESS_THIS,
  CONTRACT_BALANCE,
  FeeAmount,
  MSG_SENDER,
  TICK_SPACINGS,
  V2_FEE_PLACEHOLDER,
} from './shared/constants'
import { encodePriceSqrt } from './shared/encodePriceSqrt'
import { expandTo18Decimals } from './shared/expandTo18Decimals'
import { expect } from './shared/expect'
import { encodePath } from './shared/path'
import { getMaxTick, getMinTick } from './shared/ticks'

describe('SwapRouter', function () {
  this.timeout(40000)
  let wallet: Wallet
  let trader: Wallet

  const swapRouterFixture: Fixture<{
    weth9: IWETH9
    factory: Contract
    factoryV2: Contract
    router: MockTimeSwapRouter02
    quoter: MixedRouteQuoterV1
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

    const quoterFactory = await ethers.getContractFactory('MixedRouteQuoterV1')
    quoter = (await quoterFactory.deploy(factory.address, factoryV2.address, weth9.address)) as MixedRouteQuoterV1

    return {
      weth9,
      factory,
      factoryV2,
      router,
      quoter,
      tokens,
      nft,
    }
  }

  let factory: Contract
  let factoryV2: Contract
  let weth9: IWETH9
  let router: MockTimeSwapRouter02
  let quoter: MixedRouteQuoterV1
  let nft: Contract
  let tokens: [TestERC20, TestERC20, TestERC20]
  let getBalances: (
    who: string
  ) => Promise<{
    weth9: BigNumber
    token0: BigNumber
    token1: BigNumber
    token2: BigNumber
  }>

  let loadFixture: ReturnType<typeof waffle.createFixtureLoader>

  function encodeUnwrapWETH9(amount: number) {
    const functionSignature = 'unwrapWETH9(uint256,address)'
    return solidityPack(
      ['bytes4', 'bytes'],
      [
        router.interface.getSighash(functionSignature),
        defaultAbiCoder.encode(router.interface.functions[functionSignature].inputs, [amount, trader.address]),
      ]
    )
  }

  function encodeSweep(token: string, amount: number, recipient: string) {
    const functionSignature = 'sweepToken(address,uint256,address)'
    return solidityPack(
      ['bytes4', 'bytes'],
      [
        router.interface.getSighash(functionSignature),
        defaultAbiCoder.encode(router.interface.functions[functionSignature].inputs, [token, amount, recipient]),
      ]
    )
  }

  before('create fixture loader', async () => {
    ;[wallet, trader] = await (ethers as any).getSigners()
    loadFixture = waffle.createFixtureLoader([wallet, trader])
  })

  // helper for getting weth and token balances
  beforeEach('load fixture', async () => {
    ;({ router, quoter, weth9, factory, factoryV2, tokens, nft } = await loadFixture(swapRouterFixture))

    getBalances = async (who: string) => {
      const balances = await Promise.all([
        weth9.balanceOf(who),
        tokens[0].balanceOf(who),
        tokens[1].balanceOf(who),
        tokens[2].balanceOf(who),
      ])
      return {
        weth9: balances[0],
        token0: balances[1],
        token1: balances[2],
        token2: balances[3],
      }
    }
  })

  // ensure the swap router never ends up with a balance
  afterEach('load fixture', async () => {
    const balances = await getBalances(router.address)
    expect(Object.values(balances).every((b) => b.eq(0))).to.be.eq(true)
    const balance = await waffle.provider.getBalance(router.address)
    expect(balance.eq(0)).to.be.eq(true)
  })

  it('bytecode size', async () => {
    expect(((await router.provider.getCode(router.address)).length - 2) / 2).to.matchSnapshot()
  })

  const liquidity = 1000000
  async function createV3Pool(tokenAddressA: string, tokenAddressB: string) {
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
  describe('swaps - v3', () => {
    async function createPoolWETH9(tokenAddress: string) {
      await weth9.deposit({ value: liquidity })
      await weth9.approve(nft.address, constants.MaxUint256)
      return createV3Pool(weth9.address, tokenAddress)
    }

    beforeEach('create 0-1 and 1-2 pools', async () => {
      await createV3Pool(tokens[0].address, tokens[1].address)
      await createV3Pool(tokens[1].address, tokens[2].address)
    })

    describe('#exactInput', () => {
      async function exactInput(
        tokens: string[],
        amountIn: number = 3,
        amountOutMinimum: number = 1
      ): Promise<ContractTransaction> {
        const inputIsWETH = weth9.address === tokens[0]
        const outputIsWETH9 = tokens[tokens.length - 1] === weth9.address

        const value = inputIsWETH ? amountIn : 0

        const params = {
          path: encodePath(tokens, new Array(tokens.length - 1).fill(FeeAmount.MEDIUM)),
          recipient: outputIsWETH9 ? ADDRESS_THIS : MSG_SENDER,
          amountIn,
          amountOutMinimum,
        }

        const data = [router.interface.encodeFunctionData('exactInput', [params])]
        if (outputIsWETH9) {
          data.push(encodeUnwrapWETH9(amountOutMinimum))
        }

        // ensure that the swap fails if the limit is any tighter
        const amountOut = await router.connect(trader).callStatic.exactInput(params, { value })
        expect(amountOut.toNumber()).to.be.eq(amountOutMinimum)

        return router.connect(trader)['multicall(bytes[])'](data, { value })
      }

      describe('single-pool', () => {
        it('0 -> 1', async () => {
          const pool = await factory.getPool(tokens[0].address, tokens[1].address, FeeAmount.MEDIUM)

          // get balances before
          const poolBefore = await getBalances(pool)
          const traderBefore = await getBalances(trader.address)

          await exactInput(tokens.slice(0, 2).map((token) => token.address))

          // get balances after
          const poolAfter = await getBalances(pool)
          const traderAfter = await getBalances(trader.address)

          expect(traderAfter.token0).to.be.eq(traderBefore.token0.sub(3))
          expect(traderAfter.token1).to.be.eq(traderBefore.token1.add(1))
          expect(poolAfter.token0).to.be.eq(poolBefore.token0.add(3))
          expect(poolAfter.token1).to.be.eq(poolBefore.token1.sub(1))
        })

        it('1 -> 0', async () => {
          const pool = await factory.getPool(tokens[1].address, tokens[0].address, FeeAmount.MEDIUM)

          // get balances before
          const poolBefore = await getBalances(pool)
          const traderBefore = await getBalances(trader.address)

          await exactInput(
            tokens
              .slice(0, 2)
              .reverse()
              .map((token) => token.address)
          )

          // get balances after
          const poolAfter = await getBalances(pool)
          const traderAfter = await getBalances(trader.address)

          expect(traderAfter.token0).to.be.eq(traderBefore.token0.add(1))
          expect(traderAfter.token1).to.be.eq(traderBefore.token1.sub(3))
          expect(poolAfter.token0).to.be.eq(poolBefore.token0.sub(1))
          expect(poolAfter.token1).to.be.eq(poolBefore.token1.add(3))
        })
      })

      describe('multi-pool', () => {
        it('0 -> 1 -> 2', async () => {
          const traderBefore = await getBalances(trader.address)

          await exactInput(
            tokens.map((token) => token.address),
            5,
            1
          )

          const traderAfter = await getBalances(trader.address)

          expect(traderAfter.token0).to.be.eq(traderBefore.token0.sub(5))
          expect(traderAfter.token2).to.be.eq(traderBefore.token2.add(1))
        })

        it('2 -> 1 -> 0', async () => {
          const traderBefore = await getBalances(trader.address)

          await exactInput(tokens.map((token) => token.address).reverse(), 5, 1)

          const traderAfter = await getBalances(trader.address)

          expect(traderAfter.token2).to.be.eq(traderBefore.token2.sub(5))
          expect(traderAfter.token0).to.be.eq(traderBefore.token0.add(1))
        })

        it('events', async () => {
          await expect(
            exactInput(
              tokens.map((token) => token.address),
              5,
              1
            )
          )
            .to.emit(tokens[0], 'Transfer')
            .withArgs(
              trader.address,
              computePoolAddress(factory.address, [tokens[0].address, tokens[1].address], FeeAmount.MEDIUM),
              5
            )
            .to.emit(tokens[1], 'Transfer')
            .withArgs(
              computePoolAddress(factory.address, [tokens[0].address, tokens[1].address], FeeAmount.MEDIUM),
              router.address,
              3
            )
            .to.emit(tokens[1], 'Transfer')
            .withArgs(
              router.address,
              computePoolAddress(factory.address, [tokens[1].address, tokens[2].address], FeeAmount.MEDIUM),
              3
            )
            .to.emit(tokens[2], 'Transfer')
            .withArgs(
              computePoolAddress(factory.address, [tokens[1].address, tokens[2].address], FeeAmount.MEDIUM),
              trader.address,
              1
            )
        })
      })

      describe('ETH input', () => {
        describe('WETH9', () => {
          beforeEach(async () => {
            await createPoolWETH9(tokens[0].address)
          })

          it('WETH9 -> 0', async () => {
            const pool = await factory.getPool(weth9.address, tokens[0].address, FeeAmount.MEDIUM)

            // get balances before
            const poolBefore = await getBalances(pool)
            const traderBefore = await getBalances(trader.address)

            await expect(exactInput([weth9.address, tokens[0].address]))
              .to.emit(weth9, 'Deposit')
              .withArgs(router.address, 3)

            // get balances after
            const poolAfter = await getBalances(pool)
            const traderAfter = await getBalances(trader.address)

            expect(traderAfter.token0).to.be.eq(traderBefore.token0.add(1))
            expect(poolAfter.weth9).to.be.eq(poolBefore.weth9.add(3))
            expect(poolAfter.token0).to.be.eq(poolBefore.token0.sub(1))
          })

          it('WETH9 -> 0 -> 1', async () => {
            const traderBefore = await getBalances(trader.address)

            await expect(exactInput([weth9.address, tokens[0].address, tokens[1].address], 5))
              .to.emit(weth9, 'Deposit')
              .withArgs(router.address, 5)

            const traderAfter = await getBalances(trader.address)

            expect(traderAfter.token1).to.be.eq(traderBefore.token1.add(1))
          })
        })
      })

      describe('ETH output', () => {
        describe('WETH9', () => {
          beforeEach(async () => {
            await createPoolWETH9(tokens[0].address)
            await createPoolWETH9(tokens[1].address)
          })

          it('0 -> WETH9', async () => {
            const pool = await factory.getPool(tokens[0].address, weth9.address, FeeAmount.MEDIUM)

            // get balances before
            const poolBefore = await getBalances(pool)
            const traderBefore = await getBalances(trader.address)

            await expect(exactInput([tokens[0].address, weth9.address]))
              .to.emit(weth9, 'Withdrawal')
              .withArgs(router.address, 1)

            // get balances after
            const poolAfter = await getBalances(pool)
            const traderAfter = await getBalances(trader.address)

            expect(traderAfter.token0).to.be.eq(traderBefore.token0.sub(3))
            expect(poolAfter.weth9).to.be.eq(poolBefore.weth9.sub(1))
            expect(poolAfter.token0).to.be.eq(poolBefore.token0.add(3))
          })

          it('0 -> 1 -> WETH9', async () => {
            // get balances before
            const traderBefore = await getBalances(trader.address)

            await expect(exactInput([tokens[0].address, tokens[1].address, weth9.address], 5))
              .to.emit(weth9, 'Withdrawal')
              .withArgs(router.address, 1)

            // get balances after
            const traderAfter = await getBalances(trader.address)

            expect(traderAfter.token0).to.be.eq(traderBefore.token0.sub(5))
          })
        })
      })
    })

    describe('#exactInputSingle', () => {
      async function exactInputSingle(
        tokenIn: string,
        tokenOut: string,
        amountIn: number = 3,
        amountOutMinimum: number = 1,
        sqrtPriceLimitX96?: BigNumber
      ): Promise<ContractTransaction> {
        const inputIsWETH = weth9.address === tokenIn
        const outputIsWETH9 = tokenOut === weth9.address

        const value = inputIsWETH ? amountIn : 0

        const params = {
          tokenIn,
          tokenOut,
          fee: FeeAmount.MEDIUM,
          recipient: outputIsWETH9 ? ADDRESS_THIS : MSG_SENDER,
          amountIn,
          amountOutMinimum,
          sqrtPriceLimitX96: sqrtPriceLimitX96 ?? 0,
        }

        const data = [router.interface.encodeFunctionData('exactInputSingle', [params])]
        if (outputIsWETH9) {
          data.push(encodeUnwrapWETH9(amountOutMinimum))
        }

        // ensure that the swap fails if the limit is any tighter
        const amountOut = await router.connect(trader).callStatic.exactInputSingle(params, { value })
        expect(amountOut.toNumber()).to.be.eq(amountOutMinimum)

        // optimized for the gas test
        return data.length === 1
          ? router.connect(trader).exactInputSingle(params, { value })
          : router.connect(trader)['multicall(bytes[])'](data, { value })
      }

      it('0 -> 1', async () => {
        const pool = await factory.getPool(tokens[0].address, tokens[1].address, FeeAmount.MEDIUM)

        // get balances before
        const poolBefore = await getBalances(pool)
        const traderBefore = await getBalances(trader.address)

        await exactInputSingle(tokens[0].address, tokens[1].address)

        // get balances after
        const poolAfter = await getBalances(pool)
        const traderAfter = await getBalances(trader.address)

        expect(traderAfter.token0).to.be.eq(traderBefore.token0.sub(3))
        expect(traderAfter.token1).to.be.eq(traderBefore.token1.add(1))
        expect(poolAfter.token0).to.be.eq(poolBefore.token0.add(3))
        expect(poolAfter.token1).to.be.eq(poolBefore.token1.sub(1))
      })

      it('1 -> 0', async () => {
        const pool = await factory.getPool(tokens[1].address, tokens[0].address, FeeAmount.MEDIUM)

        // get balances before
        const poolBefore = await getBalances(pool)
        const traderBefore = await getBalances(trader.address)

        await exactInputSingle(tokens[1].address, tokens[0].address)

        // get balances after
        const poolAfter = await getBalances(pool)
        const traderAfter = await getBalances(trader.address)

        expect(traderAfter.token0).to.be.eq(traderBefore.token0.add(1))
        expect(traderAfter.token1).to.be.eq(traderBefore.token1.sub(3))
        expect(poolAfter.token0).to.be.eq(poolBefore.token0.sub(1))
        expect(poolAfter.token1).to.be.eq(poolBefore.token1.add(3))
      })

      describe('ETH input', () => {
        describe('WETH9', () => {
          beforeEach(async () => {
            await createPoolWETH9(tokens[0].address)
          })

          it('WETH9 -> 0', async () => {
            const pool = await factory.getPool(weth9.address, tokens[0].address, FeeAmount.MEDIUM)

            // get balances before
            const poolBefore = await getBalances(pool)
            const traderBefore = await getBalances(trader.address)

            await expect(exactInputSingle(weth9.address, tokens[0].address))
              .to.emit(weth9, 'Deposit')
              .withArgs(router.address, 3)

            // get balances after
            const poolAfter = await getBalances(pool)
            const traderAfter = await getBalances(trader.address)

            expect(traderAfter.token0).to.be.eq(traderBefore.token0.add(1))
            expect(poolAfter.weth9).to.be.eq(poolBefore.weth9.add(3))
            expect(poolAfter.token0).to.be.eq(poolBefore.token0.sub(1))
          })
        })
      })

      describe('ETH output', () => {
        describe('WETH9', () => {
          beforeEach(async () => {
            await createPoolWETH9(tokens[0].address)
            await createPoolWETH9(tokens[1].address)
          })

          it('0 -> WETH9', async () => {
            const pool = await factory.getPool(tokens[0].address, weth9.address, FeeAmount.MEDIUM)

            // get balances before
            const poolBefore = await getBalances(pool)
            const traderBefore = await getBalances(trader.address)

            await expect(exactInputSingle(tokens[0].address, weth9.address))
              .to.emit(weth9, 'Withdrawal')
              .withArgs(router.address, 1)

            // get balances after
            const poolAfter = await getBalances(pool)
            const traderAfter = await getBalances(trader.address)

            expect(traderAfter.token0).to.be.eq(traderBefore.token0.sub(3))
            expect(poolAfter.weth9).to.be.eq(poolBefore.weth9.sub(1))
            expect(poolAfter.token0).to.be.eq(poolBefore.token0.add(3))
          })
        })
      })
    })

    describe('#exactOutput', () => {
      async function exactOutput(
        tokens: string[],
        amountOut: number = 1,
        amountInMaximum: number = 3
      ): Promise<ContractTransaction> {
        const inputIsWETH9 = tokens[0] === weth9.address
        const outputIsWETH9 = tokens[tokens.length - 1] === weth9.address

        const value = inputIsWETH9 ? amountInMaximum : 0

        const params = {
          path: encodePath(tokens.slice().reverse(), new Array(tokens.length - 1).fill(FeeAmount.MEDIUM)),
          recipient: outputIsWETH9 ? ADDRESS_THIS : MSG_SENDER,
          amountOut,
          amountInMaximum,
        }

        const data = [router.interface.encodeFunctionData('exactOutput', [params])]
        if (inputIsWETH9) {
          data.push(router.interface.encodeFunctionData('refundETH'))
        }

        if (outputIsWETH9) {
          data.push(encodeUnwrapWETH9(amountOut))
        }

        // ensure that the swap fails if the limit is any tighter
        const amountIn = await router.connect(trader).callStatic.exactOutput(params, { value })
        expect(amountIn.toNumber()).to.be.eq(amountInMaximum)

        return router.connect(trader)['multicall(bytes[])'](data, { value })
      }

      describe('single-pool', () => {
        it('0 -> 1', async () => {
          const pool = await factory.getPool(tokens[0].address, tokens[1].address, FeeAmount.MEDIUM)

          // get balances before
          const poolBefore = await getBalances(pool)
          const traderBefore = await getBalances(trader.address)

          await exactOutput(tokens.slice(0, 2).map((token) => token.address))

          // get balances after
          const poolAfter = await getBalances(pool)
          const traderAfter = await getBalances(trader.address)

          expect(traderAfter.token0).to.be.eq(traderBefore.token0.sub(3))
          expect(traderAfter.token1).to.be.eq(traderBefore.token1.add(1))
          expect(poolAfter.token0).to.be.eq(poolBefore.token0.add(3))
          expect(poolAfter.token1).to.be.eq(poolBefore.token1.sub(1))
        })

        it('1 -> 0', async () => {
          const pool = await factory.getPool(tokens[1].address, tokens[0].address, FeeAmount.MEDIUM)

          // get balances before
          const poolBefore = await getBalances(pool)
          const traderBefore = await getBalances(trader.address)

          await exactOutput(
            tokens
              .slice(0, 2)
              .reverse()
              .map((token) => token.address)
          )

          // get balances after
          const poolAfter = await getBalances(pool)
          const traderAfter = await getBalances(trader.address)

          expect(traderAfter.token0).to.be.eq(traderBefore.token0.add(1))
          expect(traderAfter.token1).to.be.eq(traderBefore.token1.sub(3))
          expect(poolAfter.token0).to.be.eq(poolBefore.token0.sub(1))
          expect(poolAfter.token1).to.be.eq(poolBefore.token1.add(3))
        })
      })

      describe('multi-pool', () => {
        it('0 -> 1 -> 2', async () => {
          const traderBefore = await getBalances(trader.address)

          await exactOutput(
            tokens.map((token) => token.address),
            1,
            5
          )

          const traderAfter = await getBalances(trader.address)

          expect(traderAfter.token0).to.be.eq(traderBefore.token0.sub(5))
          expect(traderAfter.token2).to.be.eq(traderBefore.token2.add(1))
        })

        it('2 -> 1 -> 0', async () => {
          const traderBefore = await getBalances(trader.address)

          await exactOutput(tokens.map((token) => token.address).reverse(), 1, 5)

          const traderAfter = await getBalances(trader.address)

          expect(traderAfter.token2).to.be.eq(traderBefore.token2.sub(5))
          expect(traderAfter.token0).to.be.eq(traderBefore.token0.add(1))
        })

        it('events', async () => {
          await expect(
            exactOutput(
              tokens.map((token) => token.address),
              1,
              5
            )
          )
            .to.emit(tokens[2], 'Transfer')
            .withArgs(
              computePoolAddress(factory.address, [tokens[2].address, tokens[1].address], FeeAmount.MEDIUM),
              trader.address,
              1
            )
            .to.emit(tokens[1], 'Transfer')
            .withArgs(
              computePoolAddress(factory.address, [tokens[1].address, tokens[0].address], FeeAmount.MEDIUM),
              computePoolAddress(factory.address, [tokens[2].address, tokens[1].address], FeeAmount.MEDIUM),
              3
            )
            .to.emit(tokens[0], 'Transfer')
            .withArgs(
              trader.address,
              computePoolAddress(factory.address, [tokens[1].address, tokens[0].address], FeeAmount.MEDIUM),
              5
            )
        })
      })

      describe('ETH input', () => {
        describe('WETH9', () => {
          beforeEach(async () => {
            await createPoolWETH9(tokens[0].address)
          })

          it('WETH9 -> 0', async () => {
            const pool = await factory.getPool(weth9.address, tokens[0].address, FeeAmount.MEDIUM)

            // get balances before
            const poolBefore = await getBalances(pool)
            const traderBefore = await getBalances(trader.address)

            await expect(exactOutput([weth9.address, tokens[0].address]))
              .to.emit(weth9, 'Deposit')
              .withArgs(router.address, 3)

            // get balances after
            const poolAfter = await getBalances(pool)
            const traderAfter = await getBalances(trader.address)

            expect(traderAfter.token0).to.be.eq(traderBefore.token0.add(1))
            expect(poolAfter.weth9).to.be.eq(poolBefore.weth9.add(3))
            expect(poolAfter.token0).to.be.eq(poolBefore.token0.sub(1))
          })

          it('WETH9 -> 0 -> 1', async () => {
            const traderBefore = await getBalances(trader.address)

            await expect(exactOutput([weth9.address, tokens[0].address, tokens[1].address], 1, 5))
              .to.emit(weth9, 'Deposit')
              .withArgs(router.address, 5)

            const traderAfter = await getBalances(trader.address)

            expect(traderAfter.token1).to.be.eq(traderBefore.token1.add(1))
          })
        })
      })

      describe('ETH output', () => {
        describe('WETH9', () => {
          beforeEach(async () => {
            await createPoolWETH9(tokens[0].address)
            await createPoolWETH9(tokens[1].address)
          })

          it('0 -> WETH9', async () => {
            const pool = await factory.getPool(tokens[0].address, weth9.address, FeeAmount.MEDIUM)

            // get balances before
            const poolBefore = await getBalances(pool)
            const traderBefore = await getBalances(trader.address)

            await expect(exactOutput([tokens[0].address, weth9.address]))
              .to.emit(weth9, 'Withdrawal')
              .withArgs(router.address, 1)

            // get balances after
            const poolAfter = await getBalances(pool)
            const traderAfter = await getBalances(trader.address)

            expect(traderAfter.token0).to.be.eq(traderBefore.token0.sub(3))
            expect(poolAfter.weth9).to.be.eq(poolBefore.weth9.sub(1))
            expect(poolAfter.token0).to.be.eq(poolBefore.token0.add(3))
          })

          it('0 -> 1 -> WETH9', async () => {
            // get balances before
            const traderBefore = await getBalances(trader.address)

            await expect(exactOutput([tokens[0].address, tokens[1].address, weth9.address], 1, 5))
              .to.emit(weth9, 'Withdrawal')
              .withArgs(router.address, 1)

            // get balances after
            const traderAfter = await getBalances(trader.address)

            expect(traderAfter.token0).to.be.eq(traderBefore.token0.sub(5))
          })
        })
      })
    })

    describe('#exactOutputSingle', () => {
      async function exactOutputSingle(
        tokenIn: string,
        tokenOut: string,
        amountOut: number = 1,
        amountInMaximum: number = 3,
        sqrtPriceLimitX96?: BigNumber
      ): Promise<ContractTransaction> {
        const inputIsWETH9 = tokenIn === weth9.address
        const outputIsWETH9 = tokenOut === weth9.address

        const value = inputIsWETH9 ? amountInMaximum : 0

        const params = {
          tokenIn,
          tokenOut,
          fee: FeeAmount.MEDIUM,
          recipient: outputIsWETH9 ? ADDRESS_THIS : MSG_SENDER,
          amountOut,
          amountInMaximum,
          sqrtPriceLimitX96: sqrtPriceLimitX96 ?? 0,
        }

        const data = [router.interface.encodeFunctionData('exactOutputSingle', [params])]
        if (inputIsWETH9) {
          data.push(router.interface.encodeFunctionData('refundETH'))
        }
        if (outputIsWETH9) {
          data.push(encodeUnwrapWETH9(amountOut))
        }

        // ensure that the swap fails if the limit is any tighter
        const amountIn = await router.connect(trader).callStatic.exactOutputSingle(params, { value })
        expect(amountIn.toNumber()).to.be.eq(amountInMaximum)

        return router.connect(trader)['multicall(bytes[])'](data, { value })
      }

      it('0 -> 1', async () => {
        const pool = await factory.getPool(tokens[0].address, tokens[1].address, FeeAmount.MEDIUM)

        // get balances before
        const poolBefore = await getBalances(pool)
        const traderBefore = await getBalances(trader.address)

        await exactOutputSingle(tokens[0].address, tokens[1].address)

        // get balances after
        const poolAfter = await getBalances(pool)
        const traderAfter = await getBalances(trader.address)

        expect(traderAfter.token0).to.be.eq(traderBefore.token0.sub(3))
        expect(traderAfter.token1).to.be.eq(traderBefore.token1.add(1))
        expect(poolAfter.token0).to.be.eq(poolBefore.token0.add(3))
        expect(poolAfter.token1).to.be.eq(poolBefore.token1.sub(1))
      })

      it('1 -> 0', async () => {
        const pool = await factory.getPool(tokens[1].address, tokens[0].address, FeeAmount.MEDIUM)

        // get balances before
        const poolBefore = await getBalances(pool)
        const traderBefore = await getBalances(trader.address)

        await exactOutputSingle(tokens[1].address, tokens[0].address)

        // get balances after
        const poolAfter = await getBalances(pool)
        const traderAfter = await getBalances(trader.address)

        expect(traderAfter.token0).to.be.eq(traderBefore.token0.add(1))
        expect(traderAfter.token1).to.be.eq(traderBefore.token1.sub(3))
        expect(poolAfter.token0).to.be.eq(poolBefore.token0.sub(1))
        expect(poolAfter.token1).to.be.eq(poolBefore.token1.add(3))
      })

      describe('ETH input', () => {
        describe('WETH9', () => {
          beforeEach(async () => {
            await createPoolWETH9(tokens[0].address)
          })

          it('WETH9 -> 0', async () => {
            const pool = await factory.getPool(weth9.address, tokens[0].address, FeeAmount.MEDIUM)

            // get balances before
            const poolBefore = await getBalances(pool)
            const traderBefore = await getBalances(trader.address)

            await expect(exactOutputSingle(weth9.address, tokens[0].address))
              .to.emit(weth9, 'Deposit')
              .withArgs(router.address, 3)

            // get balances after
            const poolAfter = await getBalances(pool)
            const traderAfter = await getBalances(trader.address)

            expect(traderAfter.token0).to.be.eq(traderBefore.token0.add(1))
            expect(poolAfter.weth9).to.be.eq(poolBefore.weth9.add(3))
            expect(poolAfter.token0).to.be.eq(poolBefore.token0.sub(1))
          })
        })
      })

      describe('ETH output', () => {
        describe('WETH9', () => {
          beforeEach(async () => {
            await createPoolWETH9(tokens[0].address)
            await createPoolWETH9(tokens[1].address)
          })

          it('0 -> WETH9', async () => {
            const pool = await factory.getPool(tokens[0].address, weth9.address, FeeAmount.MEDIUM)

            // get balances before
            const poolBefore = await getBalances(pool)
            const traderBefore = await getBalances(trader.address)

            await expect(exactOutputSingle(tokens[0].address, weth9.address))
              .to.emit(weth9, 'Withdrawal')
              .withArgs(router.address, 1)

            // get balances after
            const poolAfter = await getBalances(pool)
            const traderAfter = await getBalances(trader.address)

            expect(traderAfter.token0).to.be.eq(traderBefore.token0.sub(3))
            expect(poolAfter.weth9).to.be.eq(poolBefore.weth9.sub(1))
            expect(poolAfter.token0).to.be.eq(poolBefore.token0.add(3))
          })
        })
      })
    })

    describe('*WithFee', () => {
      const feeRecipient = '0xfEE0000000000000000000000000000000000000'

      it('#sweepTokenWithFee', async () => {
        const amountOutMinimum = 100
        const params = {
          path: encodePath([tokens[0].address, tokens[1].address], [FeeAmount.MEDIUM]),
          recipient: ADDRESS_THIS,
          amountIn: 102,
          amountOutMinimum: 0,
        }

        const functionSignature = 'sweepTokenWithFee(address,uint256,address,uint256,address)'

        const data = [
          router.interface.encodeFunctionData('exactInput', [params]),
          solidityPack(
            ['bytes4', 'bytes'],
            [
              router.interface.getSighash(functionSignature),
              defaultAbiCoder.encode(
                ['address', 'uint256', 'address', 'uint256', 'address'],
                [tokens[1].address, amountOutMinimum, trader.address, 100, feeRecipient]
              ),
            ]
          ),
        ]
        await router.connect(trader)['multicall(bytes[])'](data)
        const balance = await tokens[1].balanceOf(feeRecipient)
        expect(balance.eq(1)).to.be.eq(true)
      })

      it('#unwrapWETH9WithFee', async () => {
        const startBalance = await waffle.provider.getBalance(feeRecipient)
        await createPoolWETH9(tokens[0].address)
        const amountOutMinimum = 100
        const params = {
          path: encodePath([tokens[0].address, weth9.address], [FeeAmount.MEDIUM]),
          recipient: ADDRESS_THIS,
          amountIn: 102,
          amountOutMinimum: 0,
        }

        const functionSignature = 'unwrapWETH9WithFee(uint256,address,uint256,address)'

        const data = [
          router.interface.encodeFunctionData('exactInput', [params]),
          solidityPack(
            ['bytes4', 'bytes'],
            [
              router.interface.getSighash(functionSignature),
              defaultAbiCoder.encode(
                ['uint256', 'address', 'uint256', 'address'],
                [amountOutMinimum, trader.address, 100, feeRecipient]
              ),
            ]
          ),
        ]
        await router.connect(trader)['multicall(bytes[])'](data)
        const endBalance = await waffle.provider.getBalance(feeRecipient)
        expect(endBalance.sub(startBalance).eq(1)).to.be.eq(true)
      })
    })
  })

  async function createV2Pool(tokenA: TestERC20, tokenB: TestERC20): Promise<IUniswapV2Pair> {
    await factoryV2.createPair(tokenA.address, tokenB.address)

    const pairAddress = await factoryV2.getPair(tokenA.address, tokenB.address)
    const pair = new ethers.Contract(pairAddress, PAIR_V2_ABI, wallet) as IUniswapV2Pair

    await tokenA.transfer(pair.address, liquidity)
    await tokenB.transfer(pair.address, liquidity)

    await pair.mint(wallet.address)

    return pair
  }

  describe('swaps - v2', () => {
    let pairs: IUniswapV2Pair[]
    let wethPairs: IUniswapV2Pair[]

    async function createPoolWETH9(token: TestERC20) {
      await weth9.deposit({ value: liquidity })
      return createV2Pool((weth9 as unknown) as TestERC20, token)
    }

    beforeEach('create 0-1 and 1-2 pools', async () => {
      const pair01 = await createV2Pool(tokens[0], tokens[1])
      const pair12 = await createV2Pool(tokens[1], tokens[2])
      pairs = [pair01, pair12]
    })

    describe('#swapExactTokensForTokens', () => {
      async function exactInput(
        tokens: string[],
        amountIn: number = 2,
        amountOutMinimum: number = 1
      ): Promise<ContractTransaction> {
        const inputIsWETH = weth9.address === tokens[0]
        const outputIsWETH9 = tokens[tokens.length - 1] === weth9.address

        const value = inputIsWETH ? amountIn : 0

        const params: [number, number, string[], string] = [
          amountIn,
          amountOutMinimum,
          tokens,
          outputIsWETH9 ? ADDRESS_THIS : MSG_SENDER,
        ]

        const data = [router.interface.encodeFunctionData('swapExactTokensForTokens', params)]
        if (outputIsWETH9) {
          data.push(encodeUnwrapWETH9(amountOutMinimum))
        }

        // ensure that the swap fails if the limit is any tighter
        const paramsWithValue: [number, number, string[], string, { value: number }] = [...params, { value }]
        const amountOut = await router.connect(trader).callStatic.swapExactTokensForTokens(...paramsWithValue)
        expect(amountOut.toNumber()).to.be.eq(amountOutMinimum)

        return router.connect(trader)['multicall(bytes[])'](data, { value })
      }

      describe('single-pool', () => {
        it('0 -> 1', async () => {
          // get balances before
          const poolBefore = await getBalances(pairs[0].address)
          const traderBefore = await getBalances(trader.address)

          await exactInput(tokens.slice(0, 2).map((token) => token.address))

          // get balances after
          const poolAfter = await getBalances(pairs[0].address)
          const traderAfter = await getBalances(trader.address)

          expect(traderAfter.token0).to.be.eq(traderBefore.token0.sub(2))
          expect(traderAfter.token1).to.be.eq(traderBefore.token1.add(1))
          expect(poolAfter.token0).to.be.eq(poolBefore.token0.add(2))
          expect(poolAfter.token1).to.be.eq(poolBefore.token1.sub(1))
        })

        it('1 -> 0', async () => {
          // get balances before
          const poolBefore = await getBalances(pairs[0].address)
          const traderBefore = await getBalances(trader.address)

          await exactInput(
            tokens
              .slice(0, 2)
              .reverse()
              .map((token) => token.address)
          )

          // get balances after
          const poolAfter = await getBalances(pairs[0].address)
          const traderAfter = await getBalances(trader.address)

          expect(traderAfter.token0).to.be.eq(traderBefore.token0.add(1))
          expect(traderAfter.token1).to.be.eq(traderBefore.token1.sub(2))
          expect(poolAfter.token0).to.be.eq(poolBefore.token0.sub(1))
          expect(poolAfter.token1).to.be.eq(poolBefore.token1.add(2))
        })
      })

      describe('multi-pool', () => {
        it('0 -> 1 -> 2', async () => {
          const traderBefore = await getBalances(trader.address)
          await exactInput(
            tokens.map((token) => token.address),
            3,
            1
          )
          const traderAfter = await getBalances(trader.address)
          expect(traderAfter.token0).to.be.eq(traderBefore.token0.sub(3))
          expect(traderAfter.token2).to.be.eq(traderBefore.token2.add(1))
        })
        it('2 -> 1 -> 0', async () => {
          const traderBefore = await getBalances(trader.address)
          await exactInput(tokens.map((token) => token.address).reverse(), 3, 1)
          const traderAfter = await getBalances(trader.address)
          expect(traderAfter.token2).to.be.eq(traderBefore.token2.sub(3))
          expect(traderAfter.token0).to.be.eq(traderBefore.token0.add(1))
        })

        it('events', async () => {
          await expect(
            exactInput(
              tokens.map((token) => token.address),
              3,
              1
            )
          )
            .to.emit(tokens[0], 'Transfer')
            .withArgs(trader.address, pairs[0].address, 3)
            .to.emit(tokens[1], 'Transfer')
            .withArgs(pairs[0].address, pairs[1].address, 2)
            .to.emit(tokens[2], 'Transfer')
            .withArgs(pairs[1].address, trader.address, 1)
        })
      })

      describe('ETH input', () => {
        describe('WETH9', () => {
          beforeEach(async () => {
            const pair = await createPoolWETH9(tokens[0])
            wethPairs = [pair]
          })

          it('WETH9 -> 0', async () => {
            // get balances before
            const poolBefore = await getBalances(wethPairs[0].address)
            const traderBefore = await getBalances(trader.address)
            await expect(exactInput([weth9.address, tokens[0].address]))
              .to.emit(weth9, 'Deposit')
              .withArgs(router.address, 2)
            // get balances after
            const poolAfter = await getBalances(wethPairs[0].address)
            const traderAfter = await getBalances(trader.address)
            expect(traderAfter.token0).to.be.eq(traderBefore.token0.add(1))
            expect(poolAfter.weth9).to.be.eq(poolBefore.weth9.add(2))
            expect(poolAfter.token0).to.be.eq(poolBefore.token0.sub(1))
          })

          it('WETH9 -> 0 -> 1', async () => {
            const traderBefore = await getBalances(trader.address)
            await expect(exactInput([weth9.address, tokens[0].address, tokens[1].address], 3))
              .to.emit(weth9, 'Deposit')
              .withArgs(router.address, 3)
            const traderAfter = await getBalances(trader.address)
            expect(traderAfter.token1).to.be.eq(traderBefore.token1.add(1))
          })
        })
      })

      describe('ETH output', () => {
        describe('WETH9', () => {
          beforeEach(async () => {
            const pair0 = await createPoolWETH9(tokens[0])
            const pair1 = await createPoolWETH9(tokens[1])
            wethPairs = [pair0, pair1]
          })

          it('0 -> WETH9', async () => {
            // get balances before
            const poolBefore = await getBalances(wethPairs[0].address)
            const traderBefore = await getBalances(trader.address)

            await expect(exactInput([tokens[0].address, weth9.address]))
              .to.emit(weth9, 'Withdrawal')
              .withArgs(router.address, 1)

            // get balances after
            const poolAfter = await getBalances(wethPairs[0].address)
            const traderAfter = await getBalances(trader.address)

            expect(traderAfter.token0).to.be.eq(traderBefore.token0.sub(2))
            expect(poolAfter.weth9).to.be.eq(poolBefore.weth9.sub(1))
            expect(poolAfter.token0).to.be.eq(poolBefore.token0.add(2))
          })

          it('0 -> 1 -> WETH9', async () => {
            // get balances before
            const traderBefore = await getBalances(trader.address)

            await expect(exactInput([tokens[0].address, tokens[1].address, weth9.address], 3))
              .to.emit(weth9, 'Withdrawal')
              .withArgs(router.address, 1)

            // get balances after
            const traderAfter = await getBalances(trader.address)

            expect(traderAfter.token0).to.be.eq(traderBefore.token0.sub(3))
          })
        })
      })
    })

    describe('#swapTokensForExactTokens', () => {
      async function exactOutput(
        tokens: string[],
        amountOut: number = 1,
        amountInMaximum: number = 2
      ): Promise<ContractTransaction> {
        const inputIsWETH9 = tokens[0] === weth9.address
        const outputIsWETH9 = tokens[tokens.length - 1] === weth9.address

        const value = inputIsWETH9 ? amountInMaximum : 0

        const params: [number, number, string[], string] = [
          amountOut,
          amountInMaximum,
          tokens,
          outputIsWETH9 ? ADDRESS_THIS : MSG_SENDER,
        ]

        const data = [router.interface.encodeFunctionData('swapTokensForExactTokens', params)]
        if (inputIsWETH9) {
          data.push(router.interface.encodeFunctionData('refundETH'))
        }
        if (outputIsWETH9) {
          data.push(encodeUnwrapWETH9(amountOut))
        }

        // ensure that the swap fails if the limit is any tighter
        const paramsWithValue: [number, number, string[], string, { value: number }] = [...params, { value }]
        const amountIn = await router.connect(trader).callStatic.swapTokensForExactTokens(...paramsWithValue)
        expect(amountIn.toNumber()).to.be.eq(amountInMaximum)

        return router.connect(trader)['multicall(bytes[])'](data, { value })
      }

      describe('single-pool', () => {
        it('0 -> 1', async () => {
          // get balances before
          const poolBefore = await getBalances(pairs[0].address)
          const traderBefore = await getBalances(trader.address)

          await exactOutput(tokens.slice(0, 2).map((token) => token.address))

          // get balances after
          const poolAfter = await getBalances(pairs[0].address)
          const traderAfter = await getBalances(trader.address)
          expect(traderAfter.token0).to.be.eq(traderBefore.token0.sub(2))
          expect(traderAfter.token1).to.be.eq(traderBefore.token1.add(1))
          expect(poolAfter.token0).to.be.eq(poolBefore.token0.add(2))
          expect(poolAfter.token1).to.be.eq(poolBefore.token1.sub(1))
        })

        it('1 -> 0', async () => {
          // get balances before
          const poolBefore = await getBalances(pairs[0].address)
          const traderBefore = await getBalances(trader.address)
          await exactOutput(
            tokens
              .slice(0, 2)
              .reverse()
              .map((token) => token.address)
          )
          // get balances after
          const poolAfter = await getBalances(pairs[0].address)
          const traderAfter = await getBalances(trader.address)
          expect(traderAfter.token0).to.be.eq(traderBefore.token0.add(1))
          expect(traderAfter.token1).to.be.eq(traderBefore.token1.sub(2))
          expect(poolAfter.token0).to.be.eq(poolBefore.token0.sub(1))
          expect(poolAfter.token1).to.be.eq(poolBefore.token1.add(2))
        })
      })

      describe('multi-pool', () => {
        it('0 -> 1 -> 2', async () => {
          const traderBefore = await getBalances(trader.address)
          await exactOutput(
            tokens.map((token) => token.address),
            1,
            3
          )
          const traderAfter = await getBalances(trader.address)
          expect(traderAfter.token0).to.be.eq(traderBefore.token0.sub(3))
          expect(traderAfter.token2).to.be.eq(traderBefore.token2.add(1))
        })

        it('2 -> 1 -> 0', async () => {
          const traderBefore = await getBalances(trader.address)
          await exactOutput(tokens.map((token) => token.address).reverse(), 1, 3)
          const traderAfter = await getBalances(trader.address)
          expect(traderAfter.token2).to.be.eq(traderBefore.token2.sub(3))
          expect(traderAfter.token0).to.be.eq(traderBefore.token0.add(1))
        })

        it('events', async () => {
          await expect(
            exactOutput(
              tokens.map((token) => token.address),
              1,
              3
            )
          )
            .to.emit(tokens[0], 'Transfer')
            .withArgs(trader.address, pairs[0].address, 3)
            .to.emit(tokens[1], 'Transfer')
            .withArgs(pairs[0].address, pairs[1].address, 2)
            .to.emit(tokens[2], 'Transfer')
            .withArgs(pairs[1].address, trader.address, 1)
        })
      })

      describe('ETH input', () => {
        describe('WETH9', () => {
          beforeEach(async () => {
            const pair = await createPoolWETH9(tokens[0])
            wethPairs = [pair]
          })

          it('WETH9 -> 0', async () => {
            // get balances before
            const poolBefore = await getBalances(wethPairs[0].address)
            const traderBefore = await getBalances(trader.address)
            await expect(exactOutput([weth9.address, tokens[0].address]))
              .to.emit(weth9, 'Deposit')
              .withArgs(router.address, 2)
            // get balances after
            const poolAfter = await getBalances(wethPairs[0].address)
            const traderAfter = await getBalances(trader.address)
            expect(traderAfter.token0).to.be.eq(traderBefore.token0.add(1))
            expect(poolAfter.weth9).to.be.eq(poolBefore.weth9.add(2))
            expect(poolAfter.token0).to.be.eq(poolBefore.token0.sub(1))
          })

          it('WETH9 -> 0 -> 1', async () => {
            const traderBefore = await getBalances(trader.address)
            await expect(exactOutput([weth9.address, tokens[0].address, tokens[1].address], 1, 3))
              .to.emit(weth9, 'Deposit')
              .withArgs(router.address, 3)
            const traderAfter = await getBalances(trader.address)
            expect(traderAfter.token1).to.be.eq(traderBefore.token1.add(1))
          })
        })
      })

      describe('ETH output', () => {
        describe('WETH9', () => {
          beforeEach(async () => {
            const pair0 = await createPoolWETH9(tokens[0])
            const pair1 = await createPoolWETH9(tokens[1])
            wethPairs = [pair0, pair1]
          })

          it('0 -> WETH9', async () => {
            // get balances before
            const poolBefore = await getBalances(wethPairs[0].address)
            const traderBefore = await getBalances(trader.address)
            await expect(exactOutput([tokens[0].address, weth9.address]))
              .to.emit(weth9, 'Withdrawal')
              .withArgs(router.address, 1)
            // get balances after
            const poolAfter = await getBalances(wethPairs[0].address)
            const traderAfter = await getBalances(trader.address)
            expect(traderAfter.token0).to.be.eq(traderBefore.token0.sub(2))
            expect(poolAfter.weth9).to.be.eq(poolBefore.weth9.sub(1))
            expect(poolAfter.token0).to.be.eq(poolBefore.token0.add(2))
          })

          it('0 -> 1 -> WETH9', async () => {
            // get balances before
            const traderBefore = await getBalances(trader.address)
            await expect(exactOutput([tokens[0].address, tokens[1].address, weth9.address], 1, 3))
              .to.emit(weth9, 'Withdrawal')
              .withArgs(router.address, 1)
            // get balances after
            const traderAfter = await getBalances(trader.address)
            expect(traderAfter.token0).to.be.eq(traderBefore.token0.sub(3))
          })
        })
      })
    })
  })

  describe('swaps - v2 + v3', () => {
    beforeEach('create 0-1 and 1-2 pools', async () => {
      await createV3Pool(tokens[0].address, tokens[1].address)
      await createV3Pool(tokens[1].address, tokens[2].address)
    })

    beforeEach('create 0-1 and 1-2 pools', async () => {
      await createV2Pool(tokens[0], tokens[1])
      await createV2Pool(tokens[1], tokens[2])
    })

    async function exactInputV3(
      tokens: string[],
      amountIn: number = 3,
      amountOutMinimum: number = 1,
      recipient: string,
      skipAmountOutMinimumCheck: boolean = false
    ): Promise<string[]> {
      const params = {
        path: encodePath(tokens, new Array(tokens.length - 1).fill(FeeAmount.MEDIUM)),
        recipient,
        amountIn,
        amountOutMinimum,
      }

      const data = [router.interface.encodeFunctionData('exactInput', [params])]

      if (!skipAmountOutMinimumCheck) {
        // ensure that the swap fails if the limit is any tighter
        const amountOut = await router.connect(trader).callStatic.exactInput(params)
        expect(amountOut.toNumber()).to.be.eq(amountOutMinimum)
      }

      return data
    }

    async function exactOutputV3(
      tokens: string[],
      amountOut: number = 1,
      amountInMaximum: number = 3,
      recipient: string
    ): Promise<string[]> {
      const params = {
        path: encodePath(tokens.slice().reverse(), new Array(tokens.length - 1).fill(FeeAmount.MEDIUM)),
        recipient,
        amountOut,
        amountInMaximum,
      }

      const data = [router.interface.encodeFunctionData('exactOutput', [params])]

      // ensure that the swap fails if the limit is any tighter
      const amountIn = await router.connect(trader).callStatic.exactOutput(params)
      expect(amountIn.toNumber()).to.be.eq(amountInMaximum)

      return data
    }

    async function exactInputV2(
      tokens: string[],
      amountIn: number = 2,
      amountOutMinimum: number = 1,
      recipient: string,
      skipAmountOutMinimumCheck: boolean = false
    ): Promise<string[]> {
      const params: [number, number, string[], string] = [amountIn, amountOutMinimum, tokens, recipient]

      const data = [router.interface.encodeFunctionData('swapExactTokensForTokens', params)]

      if (!skipAmountOutMinimumCheck) {
        // ensure that the swap fails if the limit is any tighter
        const amountOut = await router.connect(trader).callStatic.swapExactTokensForTokens(...params)
        expect(amountOut.toNumber()).to.be.eq(amountOutMinimum)
      }

      return data
    }

    async function exactOutputV2(
      tokens: string[],
      amountOut: number = 1,
      amountInMaximum: number = 2,
      recipient: string
    ): Promise<string[]> {
      const params: [number, number, string[], string] = [amountOut, amountInMaximum, tokens, recipient]

      const data = [router.interface.encodeFunctionData('swapTokensForExactTokens', params)]

      // ensure that the swap fails if the limit is any tighter
      const amountIn = await router.connect(trader).callStatic.swapTokensForExactTokens(...params)
      expect(amountIn.toNumber()).to.be.eq(amountInMaximum)

      return data
    }

    describe('simple split route', async () => {
      it('sending directly', async () => {
        const swapV3 = await exactInputV3(
          tokens.slice(0, 2).map((token) => token.address),
          3,
          1,
          MSG_SENDER
        )
        const swapV2 = await exactInputV2(
          tokens.slice(0, 2).map((token) => token.address),
          2,
          1,
          MSG_SENDER
        )

        const traderBefore = await getBalances(trader.address)

        await router.connect(trader)['multicall(bytes[])']([...swapV3, ...swapV2])

        const traderAfter = await getBalances(trader.address)
        expect(traderAfter.token0).to.be.eq(traderBefore.token0.sub(5))
        expect(traderAfter.token1).to.be.eq(traderBefore.token1.add(2))
      })

      it('sending to router and sweeping', async () => {
        const swapV3 = await exactInputV3(
          tokens.slice(0, 2).map((token) => token.address),
          3,
          1,
          ADDRESS_THIS
        )
        const swapV2 = await exactInputV2(
          tokens.slice(0, 2).map((token) => token.address),
          2,
          1,
          ADDRESS_THIS
        )

        const sweep = encodeSweep(tokens[1].address, 2, trader.address)

        const traderBefore = await getBalances(trader.address)

        await router.connect(trader)['multicall(bytes[])']([...swapV3, ...swapV2, sweep])

        const traderAfter = await getBalances(trader.address)
        expect(traderAfter.token0).to.be.eq(traderBefore.token0.sub(5))
        expect(traderAfter.token1).to.be.eq(traderBefore.token1.add(2))
      })
    })

    describe('merging', () => {
      // 0 ↘
      // 0 → 1 → 2

      it('exactIn x 2 + exactIn', async () => {
        const swapV3 = await exactInputV3(
          tokens.slice(0, 2).map((token) => token.address),
          3,
          1,
          ADDRESS_THIS
        )
        const swapV2 = await exactInputV2(
          tokens.slice(0, 2).map((token) => token.address),
          3,
          2,
          ADDRESS_THIS
        )

        const mergeSwap = await exactInputV3(
          tokens.slice(1, 3).map((token) => token.address),
          CONTRACT_BALANCE,
          1,
          MSG_SENDER,
          true
        )

        const traderBefore = await getBalances(trader.address)

        await router.connect(trader)['multicall(bytes[])']([...swapV3, ...swapV2, ...mergeSwap])

        const traderAfter = await getBalances(trader.address)
        expect(traderAfter.token0).to.be.eq(traderBefore.token0.sub(6))
        expect(traderAfter.token2).to.be.eq(traderBefore.token1.add(1))
      })

      it('exactOut x 2 + exactIn', async () => {
        const swapV3 = await exactOutputV3(
          tokens.slice(0, 2).map((token) => token.address),
          1,
          3,
          ADDRESS_THIS
        )
        const swapV2 = await exactOutputV2(
          tokens.slice(0, 2).map((token) => token.address),
          2,
          3,
          ADDRESS_THIS
        )

        const mergeSwap = await exactInputV3(
          tokens.slice(1, 3).map((token) => token.address),
          CONTRACT_BALANCE,
          1,
          MSG_SENDER,
          true
        )

        const traderBefore = await getBalances(trader.address)

        await router.connect(trader)['multicall(bytes[])']([...swapV3, ...swapV2, ...mergeSwap])

        const traderAfter = await getBalances(trader.address)
        expect(traderAfter.token0).to.be.eq(traderBefore.token0.sub(6))
        expect(traderAfter.token2).to.be.eq(traderBefore.token1.add(1))
      })
    })

    describe('interleaving', () => {
      // 0 -V3-> 1 -V2-> 2
      it('exactIn 0 -V3-> 1 -V2-> 2', async () => {
        const swapV3 = await exactInputV3(
          tokens.slice(0, 2).map((token) => token.address),
          10,
          8,
          ADDRESS_THIS
        )

        const swapV2 = await exactInputV2(
          tokens.slice(1, 3).map((token) => token.address),
          CONTRACT_BALANCE,
          7,
          MSG_SENDER,
          true
        )

        const traderBefore = await getBalances(trader.address)
        await router.connect(trader)['multicall(bytes[])']([...swapV3, ...swapV2])
        const traderAfter = await getBalances(trader.address)

        expect(traderAfter.token0).to.be.eq(traderBefore.token0.sub(10))
        expect(traderAfter.token2).to.be.eq(traderBefore.token2.add(7))

        const routerAmountOut = traderAfter.token2.sub(traderBefore.token2)

        // expect to equal quoter output
        const { amountOut: quoterAmountOut } = await quoter.callStatic['quoteExactInput(bytes,uint256)'](
          encodePath([tokens[0].address, tokens[1].address, tokens[2].address], [FeeAmount.MEDIUM, V2_FEE_PLACEHOLDER]),
          10
        )

        expect(quoterAmountOut.eq(routerAmountOut)).to.be.true
      })

      it('exactIn 0 -V2-> 1 -V3-> 2', async () => {
        const swapV2 = await exactInputV2(
          tokens.slice(0, 2).map((token) => token.address),
          10,
          9,
          ADDRESS_THIS
        )

        const swapV3 = await exactInputV3(
          tokens.slice(1, 3).map((token) => token.address),
          CONTRACT_BALANCE,
          7,
          MSG_SENDER,
          true
        )

        const traderBefore = await getBalances(trader.address)
        await router.connect(trader)['multicall(bytes[])']([...swapV2, ...swapV3])
        const traderAfter = await getBalances(trader.address)

        expect(traderAfter.token0).to.be.eq(traderBefore.token0.sub(10))
        expect(traderAfter.token2).to.be.eq(traderBefore.token2.add(7))

        const routerAmountOut = traderAfter.token2.sub(traderBefore.token2)

        // expect to equal quoter output
        const { amountOut: quoterAmountOut } = await quoter.callStatic['quoteExactInput(bytes,uint256)'](
          encodePath([tokens[0].address, tokens[1].address, tokens[2].address], [V2_FEE_PLACEHOLDER, FeeAmount.MEDIUM]),
          10
        )
        expect(quoterAmountOut.eq(routerAmountOut)).to.be.true
      })
    })
  })
})
