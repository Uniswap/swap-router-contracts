import { expect } from 'chai'
import { BigNumber } from 'ethers'
import { QuoterV3 } from '../typechain'

import { JsonRpcSigner } from '@ethersproject/providers'
import { ethers } from 'hardhat'
import { encodeProtocolFlags } from './shared/path'

const V3_FACTORY = '0x1F98431c8aD98523631AE4a59f267346ea31F984'
const V2_FACTORY = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f'
const WETH9 = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'

// All 18 decimals
const UNI_V3_3000_WETH_V2_DAI = `0x1f9840a85d5af5bf1d1762f925bdaddc4201f984000bb8c02aaa39b223fe8d0a0e5c4f27ead9083c756cc20000006B175474E89094C44Da98b954EedeAC495271d0F`
const UNI_V3_3000_WETH = `0x1f9840a85d5af5bf1d1762f925bdaddc4201f984000bb8c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2`

describe.only('QuoterV3 integration tests', () => {
  let quoterV3: QuoterV3
  let alice: JsonRpcSigner

  before(async () => {
    const QuoterV3Factory = await ethers.getContractFactory('QuoterV3')
    quoterV3 = (await QuoterV3Factory.deploy(V3_FACTORY, V2_FACTORY, WETH9)) as QuoterV3
    console.log('quoterV3.address: ', quoterV3.address)
  })

  it('quotes V3-V2 correctly', async () => {
    const { amountOut, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoterV3.callStatic[
      'quoteExactInput(bytes,bytes,uint256)'
    ](UNI_V3_3000_WETH_V2_DAI, encodeProtocolFlags(['V3', 'V2']), 10000)
    console.log(amountOut.toString())
    expect(amountOut).eq(BigNumber.from('80675538331724434694636'))
    expect(sqrtPriceX96AfterList[0].eq(BigNumber.from('0x0e83f285cb58c4cca14fb78b'))).to.be.true
    /**
     * Values only valid at block 14390000
     */
  })

  xit('TODO: quotes V3 percision correctly using the onChainQuoterV2', async () => {
    const { amountOut, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoterV3.callStatic[
      'quoteExactInput(bytes,bytes,uint256)'
    ](UNI_V3_3000_WETH_V2_DAI, encodeProtocolFlags(['V3', 'V2']), '0x21e19e0c9bab2400000')
    console.log(amountOut.toString())
    expect(amountOut).eq(BigNumber.from('80675538331724434694636'))
    expect(sqrtPriceX96AfterList[0].eq(BigNumber.from('0x0e83f285cb58c4cca14fb78b'))).to.be.true
    /**
     * Values only valid at block 14390000
     */
  })

  xit('quotes only V3 correctly', async () => {
    const { amountOut, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoterV3.callStatic[
      'quoteExactInput(bytes,bytes,uint256)'
    ](UNI_V3_3000_WETH, encodeProtocolFlags(['V3']), '0x21e19e0c9bab2400000')
    console.log(amountOut.toString())
    console.log(sqrtPriceX96AfterList)
    expect(amountOut).eq(BigNumber.from(9996))
  })
})
