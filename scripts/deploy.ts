import { ethers } from 'hardhat'

async function main() {
  if (!process.env.RPC_ENDPOINT || !process.env.PKEY) {
    throw 'Missing PRC or PKey!'
  }

  const [owner] = await ethers.getSigners()
  var signer = owner

  console.log('xxx signer address', signer.address)


  const factory02="0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6"
  const factory03="0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"
  const positionManager=`0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512`;
  const SwapRouter02 = await ethers.getContractFactory('SwapRouter02')
  const swapRouter02 = await SwapRouter02.deploy(
    factory02,
    factory03,
    positionManager,
    `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512`
  )
  var fs = require('fs')
  fs.writeFileSync('address.json', JSON.stringify({ swapRouter02: swapRouter02.target }, null, 4))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
