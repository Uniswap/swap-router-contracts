import { BigNumber } from 'ethers'

export function expandTo18Decimals(n: number): BigNumber {
  return BigNumber.from(n).mul(BigNumber.from(10).pow(18))
}

export function expandToNDecimals(n: number, d: number): BigNumber {
  return BigNumber.from(n).mul(BigNumber.from(10).pow(d))
}
