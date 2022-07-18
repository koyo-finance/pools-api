/**
 * Script that runs on a schedule/webhook which pulls data from
 * the graph / infura and pushes it into DynamoDB.
 */

require("dotenv").config();
import { JsonRpcProvider, Provider } from "@ethersproject/providers";
import AWS from "aws-sdk";
import debug from "debug";
import { SupportedChains } from "./constants";
import { getTokens, updatePools, updateTokens } from "./dynamodb";
import { fetchPoolsFromChain, fetchTokens, removeKnownTokens } from "./sor";
import { updateTokenPrices } from "./tokens";
import { getRPCUrl, getTokenAddressesFromPools, localAWSConfig } from "./utils";

const log = debug("koyo");

AWS.config.update(localAWSConfig);

const UPDATE_POOLS_INTERVAL = 500;
const UPDATE_PRICES_INTERVAL = 60 * 1000;

const lastBlockNumber = {};

function doWork() {
    log(`Working...`);
    Object.values(SupportedChains)
        .filter((v) => !isNaN(Number(v)))
        .forEach(async (chainId: number) => {
            lastBlockNumber[chainId] = 0;
            fetchAndSavePools(chainId);
        });
    updatePrices();
}

async function fetchAndSavePools(chainId: number) {
    const rpcUrl = getRPCUrl(chainId);
    log(`Using Infura endpoint ${rpcUrl}`);
    const provider: Provider = new JsonRpcProvider(rpcUrl, chainId);
    const currentBlockNo = await provider.getBlockNumber();

    if (currentBlockNo !== lastBlockNumber[chainId]) {
        log(`New block ${currentBlockNo} found on chain ${chainId}!`);
        log(`Fetching pools from chain ${chainId}`);
        const pools = await fetchPoolsFromChain(chainId);
        log(`Saving ${pools.length} pools for chain ${chainId} to database`);
        await updatePools(pools);
        log(`Saved pools. Fetching Tokens for pools`);
        const tokenAddresses = getTokenAddressesFromPools(pools);
        log(
            `Found ${tokenAddresses.length} tokens in pools on chain ${chainId}. Filtering by known tokens`
        );
        const filteredTokenAddresses = await removeKnownTokens(
            chainId,
            tokenAddresses
        );
        log(
            `Fetching ${filteredTokenAddresses.length} tokens for chain ${chainId}`
        );
        const tokens = await fetchTokens(chainId, filteredTokenAddresses);
        await updateTokens(tokens);
        log(`Saved ${filteredTokenAddresses.length} Tokens`);
        lastBlockNumber[chainId] = currentBlockNo;
    }

    setTimeout(fetchAndSavePools.bind(null, chainId), UPDATE_POOLS_INTERVAL);
}

async function updatePrices() {
    const tokens = await getTokens();
    console.log("Updating token prices");
    await updateTokenPrices(tokens, false);
    console.log("Updated token prices");
    setTimeout(updatePrices, UPDATE_PRICES_INTERVAL);
}

doWork();
