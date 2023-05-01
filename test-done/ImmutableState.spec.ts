import { Contract } from 'ethers'
import { ethers } from 'hardhat'
import { Wallet } from 'zksync-web3'


import { deployContract } from './shared/zkSyncUtils'
import { ImmutableStateTest } from '../typechain'
import { expect } from './shared/expect'
import completeFixture from './shared/completeFixture'
import { v2FactoryFixture } from './shared/externalFixtures'
import { getWallets } from './shared/zkSyncUtils'

describe('ImmutableState', () => {
  async function fixture(wallets: Wallet[]): Promise<{
    factoryV2: Contract
    nft: Contract
    state: ImmutableStateTest
  }> {
    const { factory: factoryV2 } = await v2FactoryFixture(wallets)
    const { nft } = await completeFixture(wallets)

    const state = await deployContract(wallets[0], 'ImmutableStateTest', [factoryV2.address, nft.address]) as ImmutableStateTest

    return {
      nft,
      factoryV2,
      state,
    }
  }

  let factoryV2: Contract
  let nft: Contract
  let state: ImmutableStateTest

  beforeEach('load fixture', async () => {
    ;({ factoryV2, nft, state } = await fixture(getWallets()))
  })

  it('bytecode size', async () => {
    expect(((await state.provider.getCode(state.address)).length - 2) / 2).to.matchSnapshot()
  })

  describe('#factoryV2', () => {
    it('points to v2 core factory', async () => {
      expect(await state.factoryV2()).to.eq(factoryV2.address)
    })
  })

  describe('#positionManager', () => {
    it('points to NFT', async () => {
      expect(await state.positionManager()).to.eq(nft.address)
    })
  })
})
