# Uniswap Swap Router

[![Tests](https://github.com/Uniswap/swap-router-contracts/workflows/Tests/badge.svg)](https://github.com/Uniswap/swap-router-contracts/actions?query=workflow%3ATests)
[![Lint](https://github.com/Uniswap/swap-router-contracts/workflows/Lint/badge.svg)](https://github.com/Uniswap/swap-router-contracts/actions?query=workflow%3ALint)

This repository contains smart contracts for swapping on the Uniswap V2 and V3 protocols.

## Bug bounty

This repository is subject to the Uniswap V3 bug bounty program,
per the terms defined [here](./bug-bounty.md).

## Local deployment

In order to deploy this code to a local testnet, you should install the npm package
`@uniswap/swap-router-contracts`
and import bytecode imported from artifacts located at
`@uniswap/swap-router-contracts/artifacts/contracts/*/*.json`.
For example:

```typescript
import {
  abi as SWAP_ROUTER_ABI,
  bytecode as SWAP_ROUTER_BYTECODE,
} from '@uniswap/swap-router-contracts/artifacts/contracts/SwapRouter02.sol/SwapRouter02.json'

// deploy the bytecode
```

This will ensure that you are testing against the same bytecode that is deployed to
mainnet and public testnets, and all Uniswap code will correctly interoperate with
your local deployment.

## Using solidity interfaces

The swap router contract interfaces are available for import into solidity smart contracts
via the npm artifact `@uniswap/swap-router-contracts`, e.g.:

```solidity
import '@uniswap/swap-router-contracts/contracts/interfaces/ISwapRouter02.sol';

contract MyContract {
  ISwapRouter02 router;

  function doSomethingWithSwapRouter() {
    // router.exactInput(...);
  }
}

```
