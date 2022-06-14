import { ethers } from 'hardhat'
import { QuoterV2, QuoterV3 } from '../typechain'

const main = async () => {
  const QuoterV3Factory = await ethers.getContractFactory('QuoterV3')
  const QuoterV2Factory = await ethers.getContractFactory('QuoterV2')
  const V3_FACTORY = '0x1F98431c8aD98523631AE4a59f267346ea31F984'
  const V2_FACTORY = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f'
  const WETH9 = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
  let quoterV3: QuoterV3
  let quoterV2: QuoterV2
  quoterV3 = (await QuoterV3Factory.deploy(V3_FACTORY, V2_FACTORY, WETH9)) as QuoterV3
  quoterV2 = (await QuoterV2Factory.deploy(V3_FACTORY, WETH9)) as QuoterV2

  const onChainQuoterV2 = await QuoterV2Factory.attach('0x61fFE014bA17989E743c5F6cB21bF9697530B21e')
  if (onChainQuoterV2.address !== '0x61fFE014bA17989E743c5F6cB21bF9697530B21e')
    throw new Error('QuoterV2Factory.attach failed')

  // const {
  //   amountOut: quote,
  //   sqrtPriceX96AfterList,
  //   initializedTicksCrossedList,
  //   gasEstimate,
  // } = await quoterV3.callStatic['quoteExactInput(bytes,bytes,uint256)'](
  //   // '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48000bb8C02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc20000006B175474E89094C44Da98b954EedeAC495271d0F', // DAI
  //   // '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000bb8c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000dac17f958d2ee523a2206206994597c13d831ec7', // end in USDT
  //   // '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000bb8a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000dac17f958d2ee523a2206206994597c13d831ec7', // flipped v3 should fail
  //   // '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000bb8dac17f958d2ee523a2206206994597c13d831ec7', // USDT, v2 - v3
  //   // '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000bb8c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // JUST USDC->WETH (V3),
  //   // '0x6B175474E89094C44Da98b954EedeAC495271d0F000064A0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  //   // '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984000bb8a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // UNI - USDC, V3, fails 0
  //   // '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000bb81f9840a85d5af5bf1d1762f925bdaddc4201f984',
  //   '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb480000646b175474e89094c44da98b954eedeac495271d0f',
  //   '0x01',
  //   10000
  // )

  // const {
  //   amountOut: quote,
  //   sqrtPriceX96AfterList,
  //   initializedTicksCrossedList,
  //   gasEstimate,
  // } = await quoterV2.callStatic['quoteExactInput(bytes,uint256)'](
  //   '0x6b175474e89094c44da98b954eedeac495271d0f0001f4a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  //   10000
  // )

  const {
    amountOut: quote,
    sqrtPriceX96AfterList,
    initializedTicksCrossedList,
    gasEstimate,
  } = await onChainQuoterV2.callStatic['quoteExactInput(bytes,uint256)'](
    '0x6b175474e89094c44da98b954eedeac495271d0f0001f4a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    10000
  )

  // const { amountOut, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate } = await quoterV3.callStatic[
  //   'quoteExactInput(bytes,uint256)'
  // ](
  //   // '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48000bb8C02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc20000006B175474E89094C44Da98b954EedeAC495271d0F', // DAI
  //   // '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000bb8c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000dac17f958d2ee523a2206206994597c13d831ec7', // end in USDT
  //   // '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000bb8dac17f958d2ee523a2206206994597c13d831ec7', // USDT, v2 - v3
  //   // '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000bb8c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // JUST USDC->WETH (V3)
  //   // '0x6B175474E89094C44Da98b954EedeAC495271d0F000064A0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC - DAI fee 100
  //   // '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb480000646b175474e89094c44da98b954eedeac495271d0f',
  //   '0x6b175474e89094c44da98b954eedeac495271d0f000064a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  //   10000
  // )

  console.log({
    quote: quote.toString(),
    sqrtPriceX96AfterList,
    initializedTicksCrossedList,
    gasEstimate: gasEstimate.toString(),
  })
}

main()
