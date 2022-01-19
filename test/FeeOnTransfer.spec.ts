import { expect } from 'chai'
import { constants } from 'ethers'
import hre, { ethers } from 'hardhat'
import { FeeOnTransfer, TestERC20 } from '../typechain'

describe('FeeOnTransfer', function () {
  let feeOnTransfer: FeeOnTransfer
  let testToken: TestERC20

  // WETH9 and USDC
  const BASE_TOKENS = ['0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48']
  // Arbitrary amount to flash loan.
  const AMOUNT_TO_BORROW = 1000

  const FOT_TOKENS = [
    '0xa68dd8cb83097765263adad881af6eed479c4a33', // WTF
    '0x8B3192f5eEBD8579568A2Ed41E6FEB402f93f73F', // SAITAMA
    '0xA2b4C0Af19cC16a6CfAcCe81F192B024d625817D', // KISHU
  ]

  const NON_FOT_TOKENS = [
    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
    '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', // UNI
    '0xc00e94Cb662C3520282E6f5717214004A7f26888', // COMP
    '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH9
  ]

  before(async function () {
    // Easiest to test FOT using real world data, so these tests require a hardhat fork.
    if (!process.env.ARCHIVE_RPC_URL) {
      this.skip()
    }

    await hre.network.provider.request({
      method: 'hardhat_reset',
      params: [
        {
          forking: {
            jsonRpcUrl: process.env.ARCHIVE_RPC_URL,
            blockNumber: 14024832,
          },
        },
      ],
    })

    const factory = await ethers.getContractFactory('FeeOnTransfer')
    feeOnTransfer = (await factory.deploy(
      '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f', // V2 Factory
      '0xC36442b4a4522E871399CD717aBDD847Ab11FE88' // V3 NFT position manager
    )) as FeeOnTransfer

    // Deploy a new token for testing.
    const tokenFactory = await ethers.getContractFactory('TestERC20')
    testToken = (await tokenFactory.deploy(constants.MaxUint256.div(2))) as TestERC20
  })

  after(async () => {
    // Disable mainnet forking to avoid effecting other tests.
    await hre.network.provider.request({
      method: 'hardhat_reset',
      params: [],
    })
  })

  it('succeeds to detect fot tokens', async () => {
    for (const token of FOT_TOKENS) {
      const isFot = await feeOnTransfer.callStatic.isFeeOnTransfer(token, BASE_TOKENS, AMOUNT_TO_BORROW)
      expect(isFot).to.be.true
    }
  })

  it('succeeds to detect fot token when token doesnt have pair with first base token', async () => {
    const isFot = await feeOnTransfer.callStatic.isFeeOnTransfer(
      FOT_TOKENS[0],
      [testToken.address, ...BASE_TOKENS],
      AMOUNT_TO_BORROW
    )
    expect(isFot).to.be.true
  })

  it('succeeds to batch detect fot tokens', async () => {
    const isFots = await feeOnTransfer.callStatic.batchIsFeeOnTransfer(FOT_TOKENS, BASE_TOKENS, AMOUNT_TO_BORROW)
    expect(isFots.every((isFot) => isFot)).to.be.true
  })

  it('succeeds to batch detect fot tokens when dont have pair with first base token', async () => {
    const isFots = await feeOnTransfer.callStatic.batchIsFeeOnTransfer(
      FOT_TOKENS,
      [testToken.address, ...BASE_TOKENS],
      AMOUNT_TO_BORROW
    )
    expect(isFots.every((isFot) => isFot)).to.be.true
  })

  it('succeeds to detect non fot tokens', async () => {
    for (const token of NON_FOT_TOKENS) {
      const isFot = await feeOnTransfer.callStatic.isFeeOnTransfer(token, BASE_TOKENS, AMOUNT_TO_BORROW)
      expect(isFot).to.be.false
    }
  })

  it('succeeds to batch detect non fot tokens', async () => {
    const isFots = await feeOnTransfer.callStatic.batchIsFeeOnTransfer(NON_FOT_TOKENS, BASE_TOKENS, AMOUNT_TO_BORROW)
    expect(isFots.every((isFot) => !isFot)).to.be.true
  })

  it('succeeds to batch detect mix of fot tokens and non fot tokens', async () => {
    const isFots = await feeOnTransfer.callStatic.batchIsFeeOnTransfer(
      [NON_FOT_TOKENS[0], FOT_TOKENS[0], FOT_TOKENS[2]],
      BASE_TOKENS,
      1000
    )
    expect(isFots).to.deep.equal([false, true, true])
  })

  it('succeeds to return false if token doesnt have a pool with any of the base tokens', async () => {
    await feeOnTransfer.callStatic.isFeeOnTransfer(testToken.address, BASE_TOKENS, AMOUNT_TO_BORROW)
  })
})
