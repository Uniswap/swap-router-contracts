import { Fixture } from 'ethereum-waffle'
import { constants, Contract, ContractTransaction, Wallet } from 'ethers'
import { waffle, ethers } from 'hardhat'
import { IWETH9, MockTimeSwapRouter02 } from '../typechain'
import completeFixture from './shared/completeFixture'
import { expect } from './shared/expect'

describe('PeripheryPaymentsExtended', function () {
  let wallet: Wallet

  const routerFixture: Fixture<{
    weth9: IWETH9
    router: MockTimeSwapRouter02
  }> = async (wallets, provider) => {
    const { weth9, router } = await completeFixture(wallets, provider)

    return {
      weth9,
      router,
    }
  }

  let router: MockTimeSwapRouter02
  let weth9: IWETH9

  let loadFixture: ReturnType<typeof waffle.createFixtureLoader>

  before('create fixture loader', async () => {
    ;[wallet] = await (ethers as any).getSigners()
    loadFixture = waffle.createFixtureLoader([wallet])
  })

  beforeEach('load fixture', async () => {
    ;({ weth9, router } = await loadFixture(routerFixture))
  })

  describe('wrapETH', () => {
    it('increases router WETH9 balance by value amount', async () => {
      const value = ethers.utils.parseEther('1')

      const weth9BalancePrev = await weth9.balanceOf(router.address)
      await router.wrapETH(value, { value })
      const weth9BalanceCurrent = await weth9.balanceOf(router.address)

      expect(weth9BalanceCurrent.sub(weth9BalancePrev)).to.equal(value)
      expect(await weth9.balanceOf(wallet.address)).to.equal('0')
      expect(await router.provider.getBalance(router.address)).to.equal('0')
    })
  })
})
