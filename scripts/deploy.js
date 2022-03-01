const hre = require('hardhat')
const ethers = hre.ethers

async function main() {
  // We get the contract to deploy
  const AddressTester = await ethers.getContractFactory('AddressTester')

  const AddressTesterCaller = await ethers.getContractFactory('AddressTesterCaller')

  const addressTester = await AddressTester.deploy()
  // const addressTester = AddressTester.attach('0x8e36F6e5214e69985BdB1A450aaBD0d6c1EB3e2b')
  const addressTesterCaller = await AddressTesterCaller.deploy(addressTester.address)

  console.log('AddressTester deployed to:', addressTester.address)
  console.log('AddressTesterCaller deployed to:', addressTesterCaller.address)

  const signer = (await ethers.getSigners())[0]

  const calldata = addressTesterCaller.interface.encodeFunctionData('validate', [])

  console.log(calldata)

  await new Promise((resolve) => {
    setTimeout(() => {
      resolve()
    }, 7500)
  })

  const r = await ethers.provider.send('eth_call', [
    {
      from: signer.address,
      data: calldata,
      to: addressTesterCaller.address,
    },
    'latest',
  ])

  console.log({ r }, 'RESULT')

  //await addressTester.callStatic.validate('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2')

  // const calldata1 = '0x207c64fb000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
  // const calldata2 = '0x207c64fb00000000eeeeeeeeeeeeeeeec02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'

  // console.log('x')
  // // await signer.call({ data: calldata1, to: addressTester.address })
  // await ethers.provider.send('eth_call', [
  //   {
  //     from: signer.address,
  //     data: calldata1,
  //     to: addressTester.address,
  //   },
  //   'latest',
  // ])

  // console.log('z')
  // await ethers.provider.send('eth_call', [
  //   {
  //     from: signer.address,
  //     data: calldata2,
  //     to: addressTester.address,
  //   },
  //   'latest',
  // ])
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
