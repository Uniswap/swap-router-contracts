import { expect } from 'chai'
import { BigNumber } from 'ethers'
import { QuoterV3 } from '../typechain'

import { JsonRpcSigner } from '@ethersproject/providers'
import hre, { ethers } from 'hardhat'
import { encodePath, encodeProtocolFlags } from './shared/path'
import { expandTo18Decimals, expandToNDecimals } from './shared/expandTo18Decimals'
import { FeeAmount } from './shared/constants'

const V3_FACTORY = '0x1F98431c8aD98523631AE4a59f267346ea31F984'
const V2_FACTORY = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f'

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7'
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
const UNI = '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984'
const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F'

/// @dev basic V2 routes
const DAI_V2_UNI_V2_WETH = encodePath([DAI, UNI, WETH], [0, 0])
const USDC_V2_UNI_V2_WETH = encodePath([USDC, UNI, WETH], [0, 0])

/// @dev basic V3 routes
const USDC_V3_500_USDT = encodePath([USDC, USDT], [FeeAmount.LOW])
const UNI_V3_3000_WETH = encodePath([UNI, WETH], [FeeAmount.MEDIUM])

/// @dev stablecoin IL routes
const USDT_V3_500_DAI_V2_USDC = encodePath([USDT, DAI, USDC], [FeeAmount.LOW, 0])
const DAI_V3_100_USDC_V2_USDT = encodePath([DAI, USDC, USDT], [100, 0])

/// @dev erc20 IL routes
// V3 - V2
const UNI_V3_3000_WETH_V2_DAI = encodePath([UNI, WETH, DAI], [FeeAmount.MEDIUM, 0])
const USDC_V3_3000_UNI_V2_WETH = encodePath([USDC, UNI, WETH], [FeeAmount.MEDIUM, 0])
// V2 - V3
const UNI_V2_WETH_V3_3000_DAI = encodePath([UNI, WETH, DAI], [0, FeeAmount.MEDIUM])

/// @dev complex IL routes
// (use two V3 pools)
const DAI_V3_3000_UNI_V2_USDT_V3_3000_WETH = encodePath([DAI, UNI, USDT, WETH], [FeeAmount.MEDIUM, 0, FeeAmount.MEDIUM])
// (use two V2 pools)
const DAI_V3_3000_UNI_V2_USDT_V2_WETH = encodePath([DAI, UNI, USDT, WETH], [FeeAmount.MEDIUM, 0, 0])

describe.only('QuoterV3 integration tests', () => {
  let quoterV3: QuoterV3
  let alice: JsonRpcSigner

  before(async () => {
    const QuoterV3Factory = await ethers.getContractFactory('QuoterV3')
    quoterV3 = (await QuoterV3Factory.deploy(V3_FACTORY, V2_FACTORY, WETH)) as QuoterV3
    console.log('quoterV3.address: ', quoterV3.address)
  })

  /**
   * Values only valid at block 14390000, we should not be running a local node of hardhat to test against, but rather using
   * the jest-environment-hardhat plugin. TODO
   */

  describe('quotes stablecoin only paths correctly', () => {
    /// @dev the amount must be expanded to the decimals of the first token in the path
    it.only('V3-V2 stablecoin path with 6 decimal in start of path', async () => {
      const { amountOut, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoterV3.callStatic[
        'quoteExactInput(bytes,bytes,uint256)'
      ](USDT_V3_500_DAI_V2_USDC, encodeProtocolFlags(['V3', 'V2']), expandToNDecimals(10000, 6))

      console.log(amountOut.toString())
      expect(amountOut).eq(BigNumber.from('9966336832'))
      expect(sqrtPriceX96AfterList[0].eq(BigNumber.from('0x10c6727487c45717095f'))).to.be.true
    })

    it.only('V3-V2 stablecoin path with 6 decimal in middle of path', async () => {
      const { amountOut, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoterV3.callStatic[
        'quoteExactInput(bytes,bytes,uint256)'
      ](DAI_V3_100_USDC_V2_USDT, encodeProtocolFlags(['V3', 'V2']), expandTo18Decimals(10000))

      console.log(amountOut.toString())
      expect(amountOut).eq(BigNumber.from('9959354898'))
      expect(sqrtPriceX96AfterList[0].eq(BigNumber.from('0x10c715093f77e3073634'))).to.be.true
    })
  })

  describe('V2-V2 quotes', () => {
    it('quotes V2-V2 correctly', async () => {
      const { amountOut, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoterV3.callStatic[
        'quoteExactInput(bytes,bytes,uint256)'
      ](DAI_V2_UNI_V2_WETH, encodeProtocolFlags(['V2', 'V2']), expandTo18Decimals(10000))

      console.log(amountOut.toString())
      expect(amountOut).eq(BigNumber.from('2035189623576328665'))
    })

    it.only('quotes V2 (6 decimal stablecoin) -V2 correctly', async () => {
      const { amountOut, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoterV3.callStatic[
        'quoteExactInput(bytes,bytes,uint256)'
      ](USDC_V2_UNI_V2_WETH, encodeProtocolFlags(['V2', 'V2']), expandToNDecimals(10000, 6))

      console.log(amountOut.toString())
      expect(amountOut).eq(BigNumber.from('1989381322826753150'))
    })
  })

  it('quotes V3-V2 erc20s with mixed decimal scales correctly', async () => {
    const { amountOut, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoterV3.callStatic[
      'quoteExactInput(bytes,bytes,uint256)'
    ](USDC_V3_3000_UNI_V2_WETH, encodeProtocolFlags(['V3', 'V2']), expandToNDecimals(10000, 6))

    console.log(amountOut.toString())
    expect(amountOut).eq(BigNumber.from('3801923847986895918')) // 3.801923847986895918
    expect(sqrtPriceX96AfterList[0].eq(BigNumber.from('0x3110863ba621ac3915fd'))).to.be.true
  })

  it('quotes V3-V2 correctly', async () => {
    const { amountOut, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoterV3.callStatic[
      'quoteExactInput(bytes,bytes,uint256)'
    ](UNI_V3_3000_WETH_V2_DAI, encodeProtocolFlags(['V3', 'V2']), expandTo18Decimals(10000))

    expect(amountOut).eq(BigNumber.from('80675538331724434694636'))
    expect(sqrtPriceX96AfterList[0].eq(BigNumber.from('0x0e83f285cb58c4cca14fb78b'))).to.be.true
  })

  it('quotes V3-V2-V3 correctly', async () => {
    const { amountOut, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoterV3.callStatic[
      'quoteExactInput(bytes,bytes,uint256)'
    ](DAI_V3_3000_UNI_V2_USDT_V3_3000_WETH, encodeProtocolFlags(['V3', 'V2', 'V3']), expandTo18Decimals(10000))

    console.log(amountOut.toString())
    expect(amountOut).eq(BigNumber.from('886596560223108447'))
    expect(sqrtPriceX96AfterList[0].eq(BigNumber.from('0xfffd8963efd1fc6a506488495d951d5263988d25'))).to.be.true
    expect(sqrtPriceX96AfterList[2].eq(BigNumber.from('0x034b624fce51aba62a4722'))).to.be.true
  })

  it('quotes V2-V3 correctly', async () => {
    const { amountOut, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoterV3.callStatic[
      'quoteExactInput(bytes,bytes,uint256)'
    ](UNI_V2_WETH_V3_3000_DAI, encodeProtocolFlags(['V2', 'V3']), expandTo18Decimals(10000))

    expect(amountOut).eq(BigNumber.from('81108655328627859394525'))
    expect(sqrtPriceX96AfterList[1].eq(BigNumber.from('0x0518b75d40eb50192903493d'))).to.be.true
  })

  it('quotes only V3 correctly', async () => {
    const { amountOut, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoterV3.callStatic[
      'quoteExactInput(bytes,bytes,uint256)'
    ](UNI_V3_3000_WETH, encodeProtocolFlags(['V3']), expandTo18Decimals(10000))
    console.log(amountOut.toString())
    expect(amountOut.eq(BigNumber.from('32215526370828998898'))).to.be.true
  })
})
