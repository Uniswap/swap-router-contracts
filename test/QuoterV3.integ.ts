import { expect } from 'chai'
import { BigNumber } from 'ethers'
import { ethers, waffle } from 'hardhat'
import { QuoterV3 } from '../typechain'

const V3_FACTORY = '0x1F98431c8aD98523631AE4a59f267346ea31F984'
const V2_FACTORY = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f'
const WETH9 = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'

const USDT_V3_USDC = '0xdAC17F958D2ee523a2206206994597C13D831ec70001f4a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'

describe.only('QuoterV3 integration tests', () => {
  let quoterV3: QuoterV3

  before(async () => {
    const QuoterV3Factory = await ethers.getContractFactory('QuoterV3')
    quoterV3 = (await QuoterV3Factory.deploy(V3_FACTORY, V2_FACTORY, WETH9)) as QuoterV3
    console.log('quoterV3.address: ', quoterV3.address)
  })

  it('quotes V3 correctly', async () => {
    const { amountOut, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoterV3.callStatic[
      'quoteExactInput(bytes,bytes,uint256)'
    ](USDT_V3_USDC, '0x01', 10000)
    expect(amountOut).eq(BigNumber.from(9996))
  })
})
