import { constants } from 'ethers'
import { TestMulticallExtended } from '../typechain/TestMulticallExtended'
import { expect } from './shared/expect'
import { deployContract, getWallets } from './shared/zkSyncUtils'

describe('MulticallExtended', async () => {
  let multicall: TestMulticallExtended

  beforeEach('create multicall', async () => {
    multicall = await deployContract((await getWallets())[0], 'TestMulticallExtended', []) as TestMulticallExtended
  })

  it('fails deadline check', async () => {
    await (await multicall.setTime(1)).wait()
    await expect(
      multicall['multicall(uint256,bytes[])'](0, [
        multicall.interface.encodeFunctionData('functionThatReturnsTuple', ['1', '2']),
      ])
    ).to.be.revertedWith('Transaction too old')
  })

  it('passes deadline check', async () => {
    const [data] = await multicall.callStatic['multicall(uint256,bytes[])'](0, [
      multicall.interface.encodeFunctionData('functionThatReturnsTuple', ['1', '2']),
    ])
    const {
      tuple: { a, b },
    } = multicall.interface.decodeFunctionResult('functionThatReturnsTuple', data)
    expect(b).to.eq(1)
    expect(a).to.eq(2)
  })

  it('fails previousBlockhash check', async () => {
    await expect(
      multicall['multicall(bytes32,bytes[])'](constants.HashZero, [
        multicall.interface.encodeFunctionData('functionThatReturnsTuple', ['1', '2']),
      ])
    ).to.be.revertedWith('Blockhash')
  })

  // TODO: Doesn't work due to the batch hash is not receivable from SDK
  // it('passes previousBlockhash check', async () => {
  //   const block = await ethers.provider.getBlock('latest')
  //   await expect(
  //     multicall['multicall(bytes32,bytes[])'](block.hash, [
  //       multicall.interface.encodeFunctionData('functionThatReturnsTuple', ['1', '2']),
  //     ])
  //   ).to.not.be.reverted
  // })
})
