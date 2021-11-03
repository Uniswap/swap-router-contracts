import { Fixture } from 'ethereum-waffle'
import { Contract } from 'ethers'
import { ethers, waffle } from 'hardhat'
import { ImmutableStateTest } from '../typechain'
import completeFixture from './shared/completeFixture'
import { ZERO_EX } from './shared/constants'
import { expect } from './shared/expect'
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
    const state = (await stateFactory.deploy(factoryV2.address, nft.address, ZERO_EX)) as ImmutableStateTest

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

  it('#factoryV2', async () => {
    expect(await state.factoryV2()).to.eq(factoryV2.address)
  })

  it('#positionManager', async () => {
    expect(await state.positionManager()).to.eq(nft.address)
  })

  it('#zeroEx', async () => {
    expect(await state.zeroEx()).to.eq(ZERO_EX)
  })
})
