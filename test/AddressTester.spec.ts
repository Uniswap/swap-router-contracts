import hre, { ethers } from 'hardhat'
import { AddressTester, AddressTesterCaller } from '../typechain'

describe('AddressTester', function () {
  let addressTester: AddressTester
  let addressTesterCaller: AddressTesterCaller

  before(async function () {
    if (!process.env.ARCHIVE_RPC_URL) {
      this.skip()
    }

    await hre.network.provider.request({
      method: 'hardhat_reset',
      params: [
        {
          forking: {
            jsonRpcUrl: process.env.ARCHIVE_RPC_URL,
            blockNumber: 14256985,
          },
        },
      ],
    })

    const factory = await ethers.getContractFactory('AddressTester')
    addressTester = (await factory.deploy()) as AddressTester

    const f1 = await ethers.getContractFactory('AddressTesterCaller')
    addressTesterCaller = (await f1.deploy(addressTester.address)) as AddressTesterCaller
  })

  after(async () => {
    // Disable mainnet forking to avoid effecting other tests.
    await hre.network.provider.request({
      method: 'hardhat_reset',
      params: [],
    })
  })

  it('1111', async () => {
    console.log('a')
    await addressTester.callStatic.validate('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2')
    const signer = (await ethers.getSigners())[0]

    // const calldata = addressTester.interface.encodeFunctionData('validate', [
    //   '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    // ])
    const calldata1 = '0x207c64fb000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
    const calldata2 = '0x207c64fb00000000eeeeeeeeeeeeeeeec02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'

    console.log('x')
    await signer.call({ data: calldata1, to: addressTester.address })
    console.log('z')
    await signer.call({ data: calldata2, to: addressTester.address })
  })

  it('2222', async () => {
    console.log('ZZZZZ')
    await addressTesterCaller.callStatic.validate()
  })
})
