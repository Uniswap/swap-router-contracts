import { ethers } from 'hardhat'
import { TestUniswapV2Library } from '../typechain'

describe('V2Library', function () {
  let uniswapLibrary: TestUniswapV2Library

  before(async function () {
    const factory = await ethers.getContractFactory('TestUniswapV2Library')
    uniswapLibrary = (await factory.deploy()) as TestUniswapV2Library
  })

  it('exact in', async () => {
    await uniswapLibrary.testEqualityAmountIn(
      '10000000000000000000000',
      '6060121762013965246271',
      '1845639706596254478341383'
    )
  })

  it('exact out', async () => {
    await uniswapLibrary.testEqualityAmountOut(
      '10000000000000000000000',
      '6060121762013965246271',
      '1845639706596254478341383'
    )
  })
})
