import { ChainId } from "@koyofinance/core-sdk";

export const COINGECKO_BASEURL =
    "https://api.coingecko.com/api/v3/simple/token_price/";
export const COINGECKO_MAX_TOKENS_PER_PAGE = 100;
export const COINGECKO_MAX_TPS = 10;

export enum SupportedChains {
    // BOBA = ChainId.BOBA,
    // AURORA = ChainId.AURORA,
    MOONRIVER = ChainId.MOONRIVER,
    POLYGON = ChainId.POLYGON,
}
