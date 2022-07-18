import { SwapTypes } from "@balancer-labs/sdk";
import { Contract } from "@ethersproject/contracts";
import { Provider } from "@ethersproject/providers";
import { ChainId } from "@koyofinance/core-sdk";
import {
    BOBA_EXCHANGE_SUBGRAPH_URL,
    CHAIN_EXCHANGE_SUBGRAPH
} from "@koyofinance/exchange-sdk";
import { BigNumber, ethers } from "ethers";
import { getToken } from "./dynamodb";
import { NativeAssetAddress, Pool, Token } from "./types";

const { BOBA_RPC, AURORA_RPC, MOONRIVER_RPC, POLYGON_RPC } = process.env;

export const localAWSConfig = {
    accessKeyId: "not-important",
    secretAccessKey: "not-important",
    region: "local",
    endpoint: "http://localhost:8000",
};

export async function getTokenInfo(
    provider: Provider,
    chainId: number,
    address: string
): Promise<Token> {
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
        symbol = await contract.symbol();
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
        price: "",
    };

    return tokenInfo;
}

export function getTokenAddressesFromPools(pools: Pool[]) {
    const tokenAddressMap = {};
    pools.forEach((pool) => {
        pool.tokensList.forEach((address) => {
            tokenAddressMap[address] = true;
        });
    });
    return Object.keys(tokenAddressMap);
}

export async function getSymbol(
    provider: Provider,
    chainId: number,
    tokenAddress: string
) {
    const tokenInfo = await getTokenInfo(provider, chainId, tokenAddress);
    return tokenInfo.symbol;
}
export async function getDecimals(
    provider,
    chainId: number,
    tokenAddress: string
) {
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

export function getRPCUrl(chainId: ChainId): string {
    switch (chainId) {
        case ChainId.AURORA:
            return AURORA_RPC;
        case ChainId.MOONRIVER:
            return MOONRIVER_RPC;
        case ChainId.POLYGON:
            return POLYGON_RPC;
        case ChainId.BOBA:
        default:
            return BOBA_RPC;
    }
}

export function getTheGraphURL(chainId: number): string {
    return CHAIN_EXCHANGE_SUBGRAPH[chainId] || BOBA_EXCHANGE_SUBGRAPH_URL;
}

export function isValidChainId(chainId: number): boolean {
    return Object.values(ChainId).filter((v) => !isNaN(Number(v))).includes(chainId);
}

export function getPlatformId(chainId: string | number): string | undefined {
    const mapping = {
        "1": "ethereum",
        "42": "ethereum",
        "137": "polygon-pos",
        "42161": "arbitrum-one",
    };

    return mapping[chainId.toString()];
}

export function getNativeAssetAddress(chainId: string | number): string {
    const mapping = {
        [ChainId.BOBA]: NativeAssetAddress.ETH,
        // CoinGecko does not provide prices in terms of MATIC
        // TODO: convert through ETH as intermediary
        [ChainId.POLYGON]: NativeAssetAddress.MATIC,
        [ChainId.MOONRIVER]: NativeAssetAddress.MOVR,
        [ChainId.AURORA]: NativeAssetAddress.ETH,
    };

    return mapping[chainId] || "eth";
}
