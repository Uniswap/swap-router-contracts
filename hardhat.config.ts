import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
require("dotenv").config();
import "hardhat-contract-sizer";
const config: HardhatUserConfig = {
  solidity: {
    version: "0.7.6",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
      },
    },
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
      chainId: Number(process.env.CHAIN_ID),
    },
    deploy: {
      url: process.env.RPC_ENDPOINT,
      // gasPrice: 10000000000,
      // gas: 10000000,
      chainId: Number(process.env.CHAIN_ID),
      accounts: [process.env.PKEY as string],
      allowUnlimitedContractSize: true,
    },
  },
};

export default config;
