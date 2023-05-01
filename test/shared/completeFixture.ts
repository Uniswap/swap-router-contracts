import { v3RouterFixture } from './externalFixtures'
import { constants } from 'ethers'
import { Wallet, Contract } from 'zksync-web3'
import { IWETH9, MockTimeSwapRouter02, TestERC20 } from '../../typechain'
import { deployContract } from './zkSyncUtils'

async function completeFixture([wallet]: Wallet[]): Promise<{
  weth9: IWETH9
  factoryV2: Contract
  factory: Contract
  router: MockTimeSwapRouter02
  nft: Contract
  tokens: [TestERC20, TestERC20, TestERC20]
}> {
  const { weth9, factoryV2, factory, nft, router } = await v3RouterFixture([wallet])
  const tokens: [TestERC20, TestERC20, TestERC20] = [
    (await deployContract(wallet, 'TestERC20', [constants.MaxUint256.div(2)])) as TestERC20, // do not use maxu256 to avoid overflowing
    (await deployContract(wallet, 'TestERC20', [constants.MaxUint256.div(2)])) as TestERC20,
    (await deployContract(wallet, 'TestERC20', [constants.MaxUint256.div(2)])) as TestERC20
  ]

  tokens.sort((a, b) => (a.address.toLowerCase() < b.address.toLowerCase() ? -1 : 1))

  return {
    weth9,
    factoryV2,
    factory,
    router,
    tokens,
    nft,
  }

}

export default completeFixture
