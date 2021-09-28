import { Contract } from 'ethers'
import { waffle, ethers } from 'hardhat'

import { Fixture } from 'ethereum-waffle'
import { ImmutableStateTest } from '../typechain'
import { expect } from './shared/expect'
import completeFixture from './shared/completeFixture'
import { v2FactoryFixture } from './shared/externalFixtures'

describe('ImmutableState', () => {
  const fixture: Fixture<{
    factoryV2: Contract
    nft: Contract
    state: ImmutableStateTest
  }> = async (wallets, provider) => {
    const { factory: factoryV2 } = await v2FactoryFixture(wallets, provider)
    const { nft } = await completeFixture(wallets, provider)

    const stateFactory = await ethers.getContractFactory('ImmutableStateTest')
    const state = (await stateFactory.deploy(factoryV2.address, nft.address)) as ImmutableStateTest

    return {
      nft,
      factoryV2,
      state,
    }
  }

  let factoryV2: Contract
  let nft: Contract
  let state: ImmutableStateTest

  let loadFixture: ReturnType<typeof waffle.createFixtureLoader>

  before('create fixture loader', async () => {
    loadFixture = waffle.createFixtureLoader(await (ethers as any).getSigners())
  })

  beforeEach('load fixture', async () => {
    ;({ factoryV2, nft, state } = await loadFixture(fixture))
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
