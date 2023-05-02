import { Wallet } from 'zksync-web3'
import { ethers } from 'hardhat'
import { IWETH9, MockTimeSwapRouter02 } from '../typechain'
import completeFixture from './shared/completeFixture'
import { expect } from './shared/expect'
import { getWallets } from './shared/zkSyncUtils'

describe('PeripheryPaymentsExtended', function () {
  let wallet: Wallet

  async function routerFixture(wallets: Wallet[]): Promise<{
    weth9: IWETH9
    router: MockTimeSwapRouter02
  }> {
    const { weth9, router } = await completeFixture(wallets)

    return {
      weth9,
      router,
    }
  }

  let router: MockTimeSwapRouter02
  let weth9: IWETH9


  before('create fixture loader', async () => {
    ;[wallet] = await getWallets()
  })

  beforeEach('load fixture', async () => {
    ;({ weth9, router } = await routerFixture([wallet]))
  })

  describe('wrapETH', () => {
    it('increases router WETH9 balance by value amount', async () => {
      const value = ethers.utils.parseEther('1')

      const weth9BalancePrev = await weth9.balanceOf(router.address)
      await (await router.wrapETH(value, { value })).wait()
      const weth9BalanceCurrent = await weth9.balanceOf(router.address)

      expect(weth9BalanceCurrent.sub(weth9BalancePrev)).to.equal(value)
      expect(await weth9.balanceOf(wallet.address)).to.equal('0')
      expect(await router.provider.getBalance(router.address)).to.equal('0')
    })
  })
})
