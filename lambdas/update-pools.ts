import { updatePools, updateTokens } from "../src/dynamodb";
import { fetchPoolsFromChain, fetchTokens, removeKnownTokens } from "../src/sor";
import { getTokenAddressesFromPools } from "../src/utils";

export const handler = async (event: any = {}): Promise<any> => {
  const log = console.log;

  const chainId = parseInt(event.pathParameters.chainId);
  if (!chainId) {
    return { statusCode: 400, body: `Error: You are missing the chainId` };
  }

  try {
    log(`Fetching pools from chain ${chainId}`)
    const pools = await fetchPoolsFromChain(chainId);
    log(`Saving ${pools.length} pools for chain ${chainId} to database`);
    await updatePools(pools);
    log(`Saved pools. Fetching Tokens for pools`);
    const tokenAddresses = getTokenAddressesFromPools(pools);
    log(`Found ${tokenAddresses.length} tokens in pools on chain ${chainId}. Filtering by known tokens`);
    const filteredTokenAddresses = await removeKnownTokens(chainId, tokenAddresses);
    log(`Fetching ${filteredTokenAddresses.length} tokens for chain ${chainId}`);
    const tokens = await fetchTokens(chainId, filteredTokenAddresses);
    await updateTokens(tokens);
    log(`Saved ${filteredTokenAddresses.length} Tokens`);
    return { statusCode: 201, body: '' };
  } catch (dbError) {
    log(`Received db error: ${dbError}`);
    return { statusCode: 500, body: JSON.stringify(dbError) };
  }
};
