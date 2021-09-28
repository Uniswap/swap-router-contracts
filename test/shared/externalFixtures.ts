import {
  abi as FACTORY_ABI,
  bytecode as FACTORY_BYTECODE,
} from '@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json'
import { abi as FACTORY_V2_ABI, bytecode as FACTORY_V2_BYTECODE } from '@uniswap/v2-core/build/UniswapV2Factory.json'
import { Fixture } from 'ethereum-waffle'
import { ethers, waffle } from 'hardhat'
import { IWETH9, MockTimeSwapRouter02 } from '../../typechain'

import WETH9 from '../contracts/WETH9.json'
import { Contract } from '@ethersproject/contracts'
import { constants } from 'ethers'

import {
  abi as NFT_POSITION_MANAGER_ABI,
  bytecode as NFT_POSITION_MANAGER_BYTECODE,
} from '@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json'

const wethFixture: Fixture<{ weth9: IWETH9 }> = async ([wallet]) => {
  const weth9 = (await waffle.deployContract(wallet, {
    bytecode: WETH9.bytecode,
    abi: WETH9.abi,
  })) as IWETH9

  return { weth9 }
}

export const v2FactoryFixture: Fixture<{ factory: Contract }> = async ([wallet]) => {
  const factory = await waffle.deployContract(
    wallet,
    {
      bytecode: FACTORY_V2_BYTECODE,
      abi: FACTORY_V2_ABI,
    },
    [constants.AddressZero]
  )

  return { factory }
}

const v3CoreFactoryFixture: Fixture<Contract> = async ([wallet]) => {
  return await waffle.deployContract(wallet, {
    bytecode: FACTORY_BYTECODE,
    abi: FACTORY_ABI,
  })
}

export const v3RouterFixture: Fixture<{
  weth9: IWETH9
  factoryV2: Contract
  factory: Contract
  nft: Contract
  router: MockTimeSwapRouter02
}> = async ([wallet], provider) => {
  const { weth9 } = await wethFixture([wallet], provider)
  const { factory: factoryV2 } = await v2FactoryFixture([wallet], provider)
  const factory = await v3CoreFactoryFixture([wallet], provider)

  const nft = await waffle.deployContract(
    wallet,
    {
      bytecode: NFT_POSITION_MANAGER_BYTECODE,
      abi: NFT_POSITION_MANAGER_ABI,
    },
    [factory.address, weth9.address, constants.AddressZero]
  )

  const router = (await (await ethers.getContractFactory('MockTimeSwapRouter02')).deploy(
    factoryV2.address,
    factory.address,
    nft.address,
    weth9.address
  )) as MockTimeSwapRouter02

  return { weth9, factoryV2, factory, nft, router }
}
