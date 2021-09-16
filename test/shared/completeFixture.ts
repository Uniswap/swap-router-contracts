import { Fixture } from 'ethereum-waffle'
import { ethers, waffle } from 'hardhat'
import { v3RouterFixture } from './externalFixtures'
import { constants, Contract } from 'ethers'
import { IWETH9, MockTimeSwapRouter, TestERC20 } from '../../typechain'

import {
  abi as NFT_POSITION_MANAGER_ABI,
  bytecode as NFT_POSITION_MANAGER_BYTECODE,
} from '@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json'

const completeFixture: Fixture<{
  weth9: IWETH9
  factory: Contract
  router: MockTimeSwapRouter
  nft: Contract
  tokens: [TestERC20, TestERC20, TestERC20]
}> = async ([wallet], provider) => {
  const { weth9, factory, router } = await v3RouterFixture([wallet], provider)

  const tokenFactory = await ethers.getContractFactory('TestERC20')
  const tokens: [TestERC20, TestERC20, TestERC20] = [
    (await tokenFactory.deploy(constants.MaxUint256.div(2))) as TestERC20, // do not use maxu256 to avoid overflowing
    (await tokenFactory.deploy(constants.MaxUint256.div(2))) as TestERC20,
    (await tokenFactory.deploy(constants.MaxUint256.div(2))) as TestERC20,
  ]

  const nft = await waffle.deployContract(
    wallet,
    {
      bytecode: NFT_POSITION_MANAGER_BYTECODE,
      abi: NFT_POSITION_MANAGER_ABI,
    },
    [factory.address, weth9.address, constants.AddressZero]
  )

  tokens.sort((a, b) => (a.address.toLowerCase() < b.address.toLowerCase() ? -1 : 1))

  return {
    weth9,
    factory,
    router,
    tokens,
    nft,
  }
}

export default completeFixture
