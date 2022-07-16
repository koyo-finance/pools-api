import { SwapTypes } from "@balancer-labs/sdk";
import { Contract } from '@ethersproject/contracts';
import { BigNumber, ethers } from "ethers";
import { getToken } from "./dynamodb";
import { NativeAssetAddress, Network, Pool, Token } from "./types";

const { INFURA_PROJECT_ID } = process.env;

export const localAWSConfig = {
  accessKeyId: 'not-important',
  secretAccessKey: 'not-important',
  region: 'local',
  endpoint: 'http://localhost:8000'
}

export async function getTokenInfo(provider, chainId: number, address: string): Promise<Token> {
  const tokenAddress = ethers.utils.getAddress(address);
  const cachedInfo = await getToken(chainId, tokenAddress);
  if (cachedInfo !== undefined) {
    return cachedInfo;
  }

  const contract = new Contract(
    tokenAddress,
    [
      "function symbol() view returns (string)",
      "function decimals() view returns (uint8)",
    ],
    provider
  );

  let symbol = `${tokenAddress.substr(0, 4)}..${tokenAddress.substr(40)}`;
  try {
    symbol = await contract.symbol()
  // eslint-disable-next-line no-empty
  } catch {}

  let decimals = 18;
  try {
    decimals = await contract.decimals();
    decimals = BigNumber.from(decimals).toNumber();
  // eslint-disable-next-line no-empty
  } catch {}

  const tokenInfo = {
    chainId,
    address: tokenAddress,
    symbol,
    decimals,
    price: ''
  }

  return tokenInfo;
}

export function getTokenAddressesFromPools(pools: Pool[]) {
  const tokenAddressMap = {};
  pools.forEach((pool) => {
    pool.tokensList.forEach(address => {
      tokenAddressMap[address] = true;
    });
  });
  return Object.keys(tokenAddressMap);
}

export async function getSymbol(provider, chainId: number, tokenAddress: string) {
  const tokenInfo = await getTokenInfo(provider, chainId, tokenAddress);
  return tokenInfo.symbol;
}
export async function getDecimals(provider, chainId: number, tokenAddress: string) {
  const tokenInfo = await getTokenInfo(provider, chainId, tokenAddress);
  return tokenInfo.decimals;
}

export function orderKindToSwapType(orderKind: string): SwapTypes {
  switch (orderKind) {
    case "sell":
      return SwapTypes.SwapExactIn;
    case "buy":
      return SwapTypes.SwapExactOut;
    default:
      throw new Error(`invalid order kind ${orderKind}`);
  }
}

export function getInfuraUrl(chainId: number): string {
  switch (chainId) {
    case Network.KOVAN:
      return `https://kovan.infura.io/v3/${INFURA_PROJECT_ID}`;
    case Network.POLYGON:
      return `https://polygon-mainnet.infura.io/v3/${INFURA_PROJECT_ID}`;
    case Network.ARBITRUM:
      return `https://arbitrum-mainnet.infura.io/v3/${INFURA_PROJECT_ID}`;
    case Network.MAINNET:
    default:
      return `https://mainnet.infura.io/v3/${INFURA_PROJECT_ID}`;
  }
}

export function getTheGraphURL(chainId: number): string {
  switch (chainId) {
    case Network.KOVAN:
      return 'https://api.thegraph.com/subgraphs/name/balancer-labs/balancer-kovan-v2';
    case Network.POLYGON:
      return 'https://api.thegraph.com/subgraphs/name/balancer-labs/balancer-polygon-v2';
    case Network.ARBITRUM:
      return 'https://api.thegraph.com/subgraphs/name/balancer-labs/balancer-arbitrum-v2'
    case Network.MAINNET:
    default:
      return 'https://api.thegraph.com/subgraphs/name/balancer-labs/balancer-v2';
  }

}

export function isValidChainId(chainId: number): boolean {
  return Object.values(Network).includes(chainId)
}

export function getPlatformId(chainId: string | number): string | undefined {
  const mapping = {
      '1': 'ethereum',
      '42': 'ethereum',
      '137': 'polygon-pos',
      '42161': 'arbitrum-one',
  };

  return mapping[chainId.toString()];
}

export function getNativeAssetAddress(chainId: string | number): string {
  const mapping = {
      '1': NativeAssetAddress.ETH,
      '42': NativeAssetAddress.ETH,
      // CoinGecko does not provide prices in terms of MATIC
      // TODO: convert through ETH as intermediary
      '137': NativeAssetAddress.MATIC,
      '42161': NativeAssetAddress.ETH,
  };

  return mapping[chainId.toString()] || 'eth';
}
