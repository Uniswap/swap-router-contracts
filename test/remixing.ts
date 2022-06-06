import { ethers } from 'hardhat'
import { QuoterV3 } from '../typechain'

const main = async () => {
  const QuoterV3Factory = await ethers.getContractFactory('QuoterV3')
  const V3_FACTORY = '0x1F98431c8aD98523631AE4a59f267346ea31F984'
  const V2_FACTORY = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f'
  const WETH9 = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
  let quoterV3: QuoterV3
  quoterV3 = (await QuoterV3Factory.deploy(V3_FACTORY, V2_FACTORY, WETH9)) as QuoterV3
  console.log(quoterV3.address)

  const { amountOut, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoterV3.callStatic[
    'quoteExactInput(bytes,bytes,uint256)'
  ](
    '0xdac17f958d2ee523a2206206994597c13d831ec7000bb8c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000bb82260fac5e5542a773aa44fbcfedf7c193bc2c599000bb8a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    '0x000000',
    10000
  )

  console.log({
    amountOut: amountOut.toString(),
    sqrtPriceX96AfterList,
    initializedTicksCrossedList,
    gasEstimate: gasEstimate.toString(),
  })

  console.log('calling OG quoteExactInput')
  const {
    amountOut: amountOutOG,
    sqrtPriceX96AfterList: sqrtPriceX96AfterListOG,
    initializedTicksCrossedList: initializedTicksCrossedListOG,
    gasEstimate: gasEstimateOG,
  } = await quoterV3.callStatic['quoteExactInput(bytes,uint256)'](
    '0xdac17f958d2ee523a2206206994597c13d831ec7000bb8c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000bb82260fac5e5542a773aa44fbcfedf7c193bc2c599000bb8a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    10000
  )

  console.log({
    amountOut: amountOutOG.toString(),
    sqrtPriceX96AfterListOG,
    initializedTicksCrossedListOG,
    gasEstimate: gasEstimateOG.toString(),
  })

  // observe that the last pool being V3 or V2 really determines the amountOut
}

main()
