require("dotenv").config();
import AWS from 'aws-sdk';
import debug from "debug";
import express from "express";
import { getPool, getPools, getToken, getTokens } from "./dynamodb";
import { getSorSwap } from "./sor";
import { isValidChainId, localAWSConfig } from "./utils";

const log = debug("balancer");
const { PORT } = process.env;

AWS.config.update(localAWSConfig);

const port = PORT || 8090;
const app = express();

app.get("/pools/:chainId", async (req, res, next) => {
  console.log("Geting pools");
  try {
    const chainId = Number(req.params['chainId']);
    if (!isValidChainId(chainId)) return res.sendStatus(404);
    const pools = await getPools(chainId);
    res.json(pools);
  } catch (error) {
    log(`Error: ${error.message}`);
    return next(error);
  }
});

app.get("/pools/:chainId/:id", async (req, res) => {
  const chainId = Number(req.params['chainId']);
  const poolId = req.params['id'];
  log(`Retrieving pool of id ${poolId}`);
  const pool = await getPool(chainId, poolId);
  if (pool) {
    return res.json(pool)
  } else {
    return res.sendStatus(404);
  }
});

app.post("/sor/:chainId", express.json(), async (req, res, next) => {
  try{
    const chainId = Number(req.params['chainId']);
    const swapInfo = await getSorSwap(chainId, req.body);
    res.json(swapInfo);
  } catch(error){
    log(`Error: ${error.message}`);
    return next(error);
  }
});

app.get("/tokens/:chainId", async (req, res, next) => {
  console.log("Getting tokens");
  try {
    const chainId = Number(req.params['chainId']);
    if (!isValidChainId(chainId)) return res.sendStatus(404);
    const tokens = await getTokens(chainId);
    res.json(tokens);
  } catch (error) {
    log(`Error: ${error.message}`);
    return next(error);
  }
});

app.get("/tokens/:chainId/:id", async (req, res) => {
  const chainId = Number(req.params['chainId']);
  const tokenId = req.params['id'];
  log(`Retrieving token of id ${tokenId}`);
  const token = await getToken(chainId, tokenId);
  if (token) {
    return res.json(token)
  } else {
    return res.sendStatus(404);
  }
});

const server = app.listen(port, () => {
  log(`Server listening at http://localhost:${port}`);
});

export default server;
