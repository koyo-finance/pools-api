import { SwapInfo, SwapOptions } from "@balancer-labs/sor";
import { BigNumber } from "@ethersproject/bignumber";
import { JsonRpcProvider } from "@ethersproject/providers";
import { ChainId } from "@koyofinance/core-sdk";
import {
    CHAIN_EXCHANGE_SUBGRAPH,
    CHAIN_MULTICALL_ONE,
    CHAIN_NATIVE_WRAPPED_ASSET,
    CHAIN_VAULT,
    Exchange,
} from "@koyofinance/exchange-sdk";
import { getToken } from "./dynamodb";
import { DatabasePoolDataService } from "./poolDataService";
import { Order, Pool, SerializedSwapInfo, Token } from "./types";
import { getRPCUrl, getTokenInfo, orderKindToSwapType } from "./utils";

const log = console.log;

export async function fetchPoolsFromChain(chainId: ChainId): Promise<Pool[]> {
    const rpcUrl = getRPCUrl(chainId);

    // Uses default PoolDataService to retrieve onChain data
    const exchange = new Exchange({
        network: chainId,
        rpcUrl: rpcUrl,
        sor: {
            vault: CHAIN_VAULT[chainId] || "",
            multi: CHAIN_MULTICALL_ONE[chainId] || "",
            wrappedNativeAsset: CHAIN_NATIVE_WRAPPED_ASSET[chainId] || "",
            subgraph: CHAIN_EXCHANGE_SUBGRAPH[chainId] || "",
        },
    });

    await exchange.sor.fetchPools();
    const pools: Pool[] = exchange.sor.getPools().map((pool) => {
        return Object.assign({}, pool, { chainId });
    });
    return pools;
}

export async function removeKnownTokens(
    chainId: number,
    tokenAddresses: string[]
): Promise<string[]> {
    const addressesWithNoInfo = await Promise.all(
        tokenAddresses.map(async (tokenAddress) => {
            const hasInfo = await getToken(chainId, tokenAddress);
            if (hasInfo) return null;
            return tokenAddress;
        })
    );
    return addressesWithNoInfo.filter((tokenAddress) => tokenAddress != null);
}

export async function fetchTokens(
    chainId: number,
    tokenAddresses: string[]
): Promise<Token[]> {
    const rpcUrl = getRPCUrl(chainId);
    const provider: any = new JsonRpcProvider(rpcUrl, chainId);

    const tokens = await Promise.all(
        tokenAddresses.map((tokenAddress) =>
            getTokenInfo(provider, chainId, tokenAddress)
        )
    );

    return tokens;
}

function serializeSwapInfo(swapInfo: SwapInfo): SerializedSwapInfo {
    const serializedSwapInfo: SerializedSwapInfo = {
        tokenAddresses: swapInfo.tokenAddresses,
        swaps: swapInfo.swaps,
        swapAmount: swapInfo.swapAmount.toString(),
        swapAmountForSwaps: swapInfo.swapAmountForSwaps
            ? swapInfo.swapAmountForSwaps.toString()
            : "",
        returnAmount: swapInfo.returnAmount.toString(),
        returnAmountFromSwaps: swapInfo.returnAmountFromSwaps
            ? swapInfo.returnAmountFromSwaps.toString()
            : "",
        returnAmountConsideringFees:
            swapInfo.returnAmountConsideringFees.toString(),
        tokenIn: swapInfo.tokenIn,
        tokenOut: swapInfo.tokenOut,
        marketSp: swapInfo.marketSp,
    };

    return serializedSwapInfo;
}

export async function getSorSwap(
    chainId: ChainId,
    order: Order
): Promise<SerializedSwapInfo> {
    log(`Getting swap: ${JSON.stringify(order)}`);
    const rpcUrl = getRPCUrl(chainId);

    // SDK/SOR will use this to retrieve pool list from db (default uses onchain call which will be slow)
    const dbPoolDataService = new DatabasePoolDataService({
        chainId: chainId,
    });

    const exchange = new Exchange({
        network: chainId,
        rpcUrl: rpcUrl,
        sor: {
            vault: CHAIN_VAULT[chainId] || "",
            multi: CHAIN_MULTICALL_ONE[chainId] || "",
            wrappedNativeAsset: CHAIN_NATIVE_WRAPPED_ASSET[chainId] || "",
            subgraph: CHAIN_EXCHANGE_SUBGRAPH[chainId] || "",
            poolDataService: dbPoolDataService,
        },
    });

    const { sellToken, buyToken, orderKind, amount, gasPrice } = order;

    const sellTokenDetails: Token = await getToken(chainId, sellToken);
    log(
        `Sell token details for token ${chainId} ${sellToken}: ${JSON.stringify(
            sellTokenDetails
        )}`
    );
    const buyTokenDetails: Token = await getToken(chainId, buyToken);
    log(
        `Buy token details for token ${chainId} ${buyToken}: ${JSON.stringify(
            buyTokenDetails
        )}`
    );

    // if (sellTokenDetails) {
    //     exchange.sor.swapCostCalculator.setNativeAssetPriceInToken(
    //         sellToken,
    //         sellTokenDetails.price
    //     );
    // } else {
    //     log(`No price found for token ${sellToken}. Defaulting to 0.`);
    //     exchange.sor.swapCostCalculator.setNativeAssetPriceInToken(
    //         sellToken,
    //         "0"
    //     );
    // }

    // if (buyTokenDetails) {
    //     exchange.sor.swapCostCalculator.setNativeAssetPriceInToken(
    //         buyToken,
    //         buyTokenDetails.price
    //     );
    // } else {
    //     log(`No price found for token ${buyToken}. Defaulting to 0.`);
    //     exchange.sor.swapCostCalculator.setNativeAssetPriceInToken(
    //         buyToken,
    //         "0"
    //     );
    // }

    const tokenIn = sellToken;
    const tokenOut = buyToken;
    const swapType = orderKindToSwapType(orderKind);

    const swapOptions: Partial<SwapOptions> = {
        forceRefresh: true,
        maxPools: 10,
        gasPrice: BigNumber.from(gasPrice),
    };

    await exchange.sor.fetchPools();

    const buyTokenSymbol = buyTokenDetails ? buyTokenDetails.symbol : buyToken;
    const sellTokenSymbol = sellTokenDetails
        ? sellTokenDetails.symbol
        : sellToken;

    log(
        `${orderKind}ing ${amount} ${sellTokenSymbol}` +
            ` for ${buyTokenSymbol}`
    );
    log(orderKind);
    log(`Token In: ${tokenIn}`);
    log(`Token Out: ${tokenOut}`);
    log(`Amount: ${amount}`);
    const swapInfo = await exchange.sor.getSwaps(
        sellToken,
        buyToken,
        swapType,
        amount,
        swapOptions
    );

    log(`SwapInfo: ${JSON.stringify(swapInfo)}`);
    log(swapInfo.swaps);
    log(swapInfo.tokenAddresses);
    log(swapInfo.returnAmount.toString());

    const serializedSwapInfo = serializeSwapInfo(swapInfo);
    log(`Serialized SwapInfo: ${JSON.stringify(swapInfo)}`);

    return serializedSwapInfo;
}
