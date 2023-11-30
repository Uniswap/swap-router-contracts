import { ethers } from 'hardhat'

async function main() {
  if (!process.env.RPC_ENDPOINT || !process.env.PKEY) {
    throw 'Missing PRC or PKey!'
  }

  const [owner] = await ethers.getSigners()
  var signer = owner

  console.log('xxx signer address', signer.address)

  const weth = '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270'

  const factory02 = '0x843bed96dB8b6F9f01e824aC2c8C3eB832b09Ce8'
  const factory03 = '0x6F210f6079a2ef18c278B4d796B8Fd366b9fe08c'
  const positionManager = `0xBd770416a3345F91E4B34576cb804a576fa48EB1`
  const SwapRouter02 = await ethers.getContractFactory('SwapRouter02')
  const swapRouter02 = await SwapRouter02.deploy(factory02, factory03, positionManager, weth)
  
  console.log('xxxx swapRouter02', swapRouter02.target)

  const Multicall2 = await ethers.getContractFactory('Multicall2')
  const muntical2 = await Multicall2.deploy()
  console.log('xxx muticall2', muntical2.target)

    var fs = require('fs')
    fs.writeFileSync(
      'address.json',
      JSON.stringify({ swapRouter02: swapRouter02.target, mutical2: muntical2.target }, null, 4)
    )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
