import { expect } from 'chai'
import { constants } from 'ethers'
import hre, { ethers } from 'hardhat'
import { TokenValidator, TestERC20, IUniswapV2Pair__factory } from '../typechain'

describe('TokenValidator', function () {
  let tokenValidator: TokenValidator
  let testToken: TestERC20

  this.timeout(100000)

  enum Status {
    UNKN = 0,
    FOT = 1,
    STF = 2,
  }

  // WETH9 and USDC
  const BASE_TOKENS = ['0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48']
  // Arbitrary amount to flash loan.
  const AMOUNT_TO_BORROW = 1000

  const FOT_TOKENS = [
    '0xa68dd8cb83097765263adad881af6eed479c4a33', // WTF
    '0x8B3192f5eEBD8579568A2Ed41E6FEB402f93f73F', // SAITAMA
    '0xA2b4C0Af19cC16a6CfAcCe81F192B024d625817D', // KISHU
  ]

  const BROKEN_TOKENS = [
    '0xd233d1f6fd11640081abb8db125f722b5dc729dc', // USD
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

    const factory = await ethers.getContractFactory('TokenValidator')
    tokenValidator = (await factory.deploy(
      '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f', // V2 Factory
      '0xC36442b4a4522E871399CD717aBDD847Ab11FE88' // V3 NFT position manager
    )) as TokenValidator

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

  it('succeeds for tokens that cant be transferred', async () => {
    for (const token of BROKEN_TOKENS) {
      const isFot = await tokenValidator.callStatic.validate(token, BASE_TOKENS, AMOUNT_TO_BORROW)
      expect(isFot).to.equal(Status.STF)
    }
  })

  it('succeeds to detect fot tokens', async () => {
    for (const token of FOT_TOKENS) {
      const isFot = await tokenValidator.callStatic.validate(token, [BASE_TOKENS[0]!], AMOUNT_TO_BORROW)
      expect(isFot).to.equal(Status.FOT)
    }
  })

  it('succeeds to detect fot token when token doesnt have pair with first base token', async () => {
    const isFot = await tokenValidator.callStatic.validate(
      FOT_TOKENS[0],
      [testToken.address, ...BASE_TOKENS],
      AMOUNT_TO_BORROW
    )
    expect(isFot).to.equal(Status.FOT)
  })

  it('succeeds to return unknown when flash loaning full reserves', async () => {
    const pairAddress = '0xab293dce330b92aa52bc2a7cd3816edaa75f890b' // WTF/ETH pair
    const pair = IUniswapV2Pair__factory.connect(pairAddress, ethers.provider)
    const { reserve0: wtfReserve } = await pair.callStatic.getReserves()

    const isFot1 = await tokenValidator.callStatic.validate(
      '0xa68dd8cb83097765263adad881af6eed479c4a33', // WTF
      ['0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'], // WETH
      wtfReserve.sub(1).toString()
    )
    expect(isFot1).to.equal(Status.FOT)

    const isFot2 = await tokenValidator.callStatic.validate(
      '0xa68dd8cb83097765263adad881af6eed479c4a33', // WTF
      ['0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'], // WETH
      wtfReserve.toString()
    )
    expect(isFot2).to.equal(Status.UNKN)
  })

  it('succeeds to batch detect fot tokens', async () => {
    const isFots = await tokenValidator.callStatic.batchValidate(FOT_TOKENS, BASE_TOKENS, AMOUNT_TO_BORROW)
    expect(isFots.every((isFot: Status) => isFot == Status.FOT)).to.be.true
  })

  it('succeeds to batch detect fot tokens when dont have pair with first base token', async () => {
    const isFots = await tokenValidator.callStatic.batchValidate(
      FOT_TOKENS,
      [testToken.address, ...BASE_TOKENS],
      AMOUNT_TO_BORROW
    )
    expect(isFots.every((isFot: Status) => isFot == Status.FOT)).to.be.true
  })

  it('succeeds to detect non fot tokens', async () => {
    for (const token of NON_FOT_TOKENS) {
      const isFot = await tokenValidator.callStatic.validate(token, BASE_TOKENS, AMOUNT_TO_BORROW)
      expect(isFot).to.equal(Status.UNKN)
    }
  })

  it('succeeds to batch detect non fot tokens', async () => {
    const isFots = await tokenValidator.callStatic.batchValidate(NON_FOT_TOKENS, BASE_TOKENS, AMOUNT_TO_BORROW)
    expect(isFots.every((isFot: Status) => isFot == Status.UNKN)).to.be.true
  })

  it('succeeds to batch detect mix of fot tokens and non fot tokens', async () => {
    const isFots = await tokenValidator.callStatic.batchValidate(
      [NON_FOT_TOKENS[0], FOT_TOKENS[0], BROKEN_TOKENS[0]],
      BASE_TOKENS,
      1000
    )
    expect(isFots).to.deep.equal([Status.UNKN, Status.FOT, Status.STF])
  })

  it('succeeds to return false if token doesnt have a pool with any of the base tokens', async () => {
    await tokenValidator.callStatic.validate(testToken.address, BASE_TOKENS, AMOUNT_TO_BORROW)
  })
})
