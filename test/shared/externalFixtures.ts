import * as FACTORY_ARTIFACT from '@uniswap/v3-core/artifacts-zk/contracts/UniswapV3Factory.sol/UniswapV3Factory.json'
import * as POOL_ARTIFACT from '@uniswap/v3-core/artifacts-zk/contracts/UniswapV3Pool.sol/UniswapV3Pool.json'
import * as FACTORY_V2_ARTIFACT from '@uniswap/v2-core/artifacts-zk/contracts/UniswapV2Factory.sol/UniswapV2Factory.json'
import * as PAIR_V2_ARTIFACT from '@uniswap/v2-core/artifacts-zk/contracts/UniswapV2Pair.sol/UniswapV2Pair.json'
import { IWETH9, MockTimeSwapRouter02 } from '../../typechain'

import { deployContractWithArtifact, deployContract } from './zkSyncUtils'
import * as WETH9 from '../contracts/WETH9.json'
import * as zk from 'zksync-web3'
import { constants, ethers } from 'ethers'
import { Wallet, Contract } from 'zksync-web3'

import * as NFT_POSITION_MANAGER_ARTIFACT
 from '@uniswap/v3-periphery/artifacts-zk/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json'
import { ZkSyncArtifact } from '@matterlabs/hardhat-zksync-deploy/dist/types'

async function wethFixture([wallet]: [Wallet]): Promise< { weth9: IWETH9 } > {
  const weth9 = (await deployContractWithArtifact(wallet, WETH9 as any as ZkSyncArtifact)) as IWETH9

  return { weth9 }
}

export async function v2FactoryFixture([wallet]: Wallet[]): Promise< { factory: Contract } > {
  const contractFactory = new zk.ContractFactory(
    FACTORY_V2_ARTIFACT.abi,
    FACTORY_V2_ARTIFACT.bytecode,
    wallet
  )

  let factoryDeps: string[] = extractFactoryDeps(FACTORY_V2_ARTIFACT as any as ZkSyncArtifact, [PAIR_V2_ARTIFACT as any as ZkSyncArtifact])
  const factory = await (await contractFactory.deploy(...[constants.AddressZero], {
    customData: {
      factoryDeps,
    },
  })).deployed()

  return { factory }
}

async function v3CoreFactoryFixture([wallet]: Wallet[]): Promise<Contract> {
  const contractFactory = new zk.ContractFactory(
    FACTORY_ARTIFACT.abi,
    FACTORY_ARTIFACT.bytecode,
    wallet
  )

  let factoryDeps: string[] = extractFactoryDeps(FACTORY_ARTIFACT as any as ZkSyncArtifact, [POOL_ARTIFACT as any as ZkSyncArtifact])

  return await (await contractFactory.deploy(...[], {
    customData: {
      factoryDeps,
    },
  })).deployed()
}

export async function v3RouterFixture([wallet]: Wallet[]): Promise<{
  weth9: IWETH9
  factoryV2: Contract
  factory: Contract
  nft: Contract
  router: MockTimeSwapRouter02
}> {
  const { weth9 } = await wethFixture([wallet])
  const { factory: factoryV2 } = await v2FactoryFixture([wallet])
  const factory = await v3CoreFactoryFixture([wallet])

  const nft = await deployContractWithArtifact(
    wallet, 
    NFT_POSITION_MANAGER_ARTIFACT as any as ZkSyncArtifact,
    [factory.address, weth9.address, constants.AddressZero]
  )

  const router = (await deployContract(wallet, 'MockTimeSwapRouter02', [
    factoryV2.address,
    factory.address,
    nft.address,
    weth9.address
  ])) as MockTimeSwapRouter02

  return { weth9, factoryV2, factory, nft, router }
}

function extractFactoryDeps(artifact: ZkSyncArtifact, knownArtifacts: ZkSyncArtifact[], visited?: Set<string>): string[] {
  if (visited == null) {
    visited = new Set<string>()
    visited.add(`${FACTORY_V2_ARTIFACT.sourceName}:${FACTORY_V2_ARTIFACT.contractName}`)
  }

  const factoryDeps: string[] = []

  for (const dependencyHash in artifact.factoryDeps) {
    const dependencyContract = artifact.factoryDeps[dependencyHash]

    if (!visited.has(dependencyContract)) {
      const dependencyArtifact = knownArtifacts.find(dependencyArtifact => {
        return dependencyArtifact.sourceName + ':' + dependencyArtifact.contractName === dependencyContract &&
          ethers.utils.hexlify(zk.utils.hashBytecode(dependencyArtifact.bytecode)) === dependencyHash
      })
      if (dependencyArtifact === undefined) {
        throw new Error('Dependency: `' + dependencyContract + '` is not found')
      }

      factoryDeps.push(dependencyArtifact.bytecode)
      visited.add(dependencyContract)
      const transitiveDeps = extractFactoryDeps(dependencyArtifact, knownArtifacts, visited)
      factoryDeps.push(...transitiveDeps)
    }
  }

  return factoryDeps
}