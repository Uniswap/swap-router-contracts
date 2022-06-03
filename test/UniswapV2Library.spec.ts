import { ethers } from 'hardhat'
import { TestUniswapV2Library } from '../typechain'

describe('V2Library', function () {
  let uniswapLibrary: TestUniswapV2Library

  before(async function () {
    const factory = await ethers.getContractFactory('TestUniswapV2Library')
    uniswapLibrary = (await factory.deploy()) as TestUniswapV2Library
  })

  it('1111', async () => {
    await uniswapLibrary.testEqualityAmountIn(
      '10000000000000000000000',
      '6060121762013965246271',
      '1845639706596254478341383'
    )
  })

  it('1111', async () => {
    await uniswapLibrary.testEqualityAmountOut(
      '10000000000000000000000',
      '1050501050035005305030525',
      '2050502502052052050250252'
    )
  })
})
