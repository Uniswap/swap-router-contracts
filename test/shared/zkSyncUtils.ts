import { Provider, Contract, Wallet, utils } from 'zksync-web3';

import { Deployer } from '@matterlabs/hardhat-zksync-deploy'
import * as hre from 'hardhat'
import * as fs from 'fs';
import { utils as ethersUtils } from 'ethers'
import { ethers } from 'hardhat';
import { ZkSyncArtifact } from '@matterlabs/hardhat-zksync-deploy/dist/types'

const RICH_WALLET_PRIVATE_KEYS = JSON.parse(fs.readFileSync(`../../local-setup/rich-wallets.json`, "utf8"));

const provider = Provider.getDefaultProvider();
const wallet = new Wallet(RICH_WALLET_PRIVATE_KEYS[0].privateKey, provider);
const DEFAULT_DEPLOYER = new Deployer(hre, wallet);

export function getWallets(): Wallet[] {
    let wallets = [];
    for (let i=0;i<RICH_WALLET_PRIVATE_KEYS.length;i++) {
        wallets[i] = new Wallet(RICH_WALLET_PRIVATE_KEYS[i].privateKey, provider);
    }

    return wallets;
}

export async function loadArtifact(name: string) {
    return await DEFAULT_DEPLOYER.loadArtifact(name);
}

export async function deployContract(wallet: Wallet, name: string, constructorArguments?: any[] | undefined): Promise<Contract> {
    const artifact = await loadArtifact(name);
    return await deployContractWithArtifact(wallet, artifact, constructorArguments)
}

export async function deployContractWithArtifact(wallet: Wallet, artifact: ZkSyncArtifact, constructorArguments?: any[] | undefined): Promise<Contract> {
    const deployer = new Deployer(hre, wallet) 
    return await deployer.deploy(artifact, constructorArguments);
}

export function getCreate2Address(
    factoryAddress: string,
    [tokenA, tokenB]: [string, string],
    fee: number,
    bytecode: string
  ): string {
    const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase() ? [tokenA, tokenB] : [tokenB, tokenA]
    const constructorArgumentsEncoded = ethersUtils.defaultAbiCoder.encode(
      ['address', 'address', 'uint24'],
      [token0, token1, fee]
    )

    return utils.create2Address(
        factoryAddress, 
        utils.hashBytecode(bytecode), 
        ethersUtils.keccak256(constructorArgumentsEncoded), 
        "0x"
    )
}

export function toEthWallet(zkWallet: Wallet) {
    return new ethers.Wallet(zkWallet.privateKey, provider as any)
}
