# Balancer Pools API

**Alpha Release, use with caution, there may be breaking changes**

A service that acts as a caching layer for Balancer Pools information. This service runs using AWS Lambda, DynamoDB and API Gateway.
This was built to speed up frontend queries, and for services such as Gnosis to use to route orders through Balancer pools.

This package consists of CDK scripts that setup all the required infrastructure, and code for all the lambdas and services involved.

It has the following components:

- A DynamoDB database that hold Balancer pool information with tokens and current balances.
- A Lambda that fetches the latest data from the graph / infura and updates the database.
- An API Gateway server and set of lambdas that handle user requests.

## Disclaimers

This software is in Alpha and may have breaking changes at any time. There is little security implemented on the Lambda functions
so anyone can call them.

## Requirements

- NodeJS 14.X (others may work, not tested yet)
- An Infura Account (for retrieving pool information, this is free to create)
- Docker + Docker Compose (for local development)
- An AWS Account (for AWS development)

## Usage

This package can be run locally for development, or deployed to an AWS account.

### Initial Setup

```bash
npm install
npm run build
cp .env.example .env
```

Open the `.env` file and set `INFURA_PROJECT_ID` to your personal [Infura](https://infura.io/) project ID.

### Local Development

This runs a local DynamoDB in a docker container, a worker process that polls for new information, and an express server to handle requests.

```sh
# Run a local DynamoDB Database
npm run dynamodb

# Create Tables
npm run init

# NOTE: If the init command hangs, you may need to fix permissions on your dynamodb data folder. You can do this with:
sudo chown -R $(whoami):docker ./docker

# Run Worker
npm run worker

# In another terminal, Run API Server
npm start
```

The API server runs on port 8090, you can run queries against the endpoint `http://localhost:8090/`

### AWS Development

Install AWS SDK

```sh
npm install -g aws-cdk
```

You may also need to install the [AWS CLI](https://aws.amazon.com/cli/) and [configure your credentials](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-configure.html) if you have not already done so.

If you've never used CDK before in your account you need to run the following bootstrap command with your account id and region.

```sh
cdk bootstrap aws://$AWS_ACCOUNT_ID/$AWS_REGION
```

Deploy / Redeploy all AWS Services to your account.

```sh
npm run build # Compile the CDK index.ts to javascript, must be run after changes are made
cdk deploy # Run CDK to create/update your infrastructure
```

After the deployment you will get an API URL that looks similar to `https://gtrabwaex9.execute-api.ap-southeast-2.amazonaws.com/prod/` this is
your API Gateway URL, all endpoints below should be appended to this. Run `export ENDPOINT_URL=<your API url>` to be able to copy and paste the example queries below.

## Infrastructure Overview

Note: Everything inside the AWS container is setup by the CDK scripts in this repository. You'll need to manually configure any external services, such as Alchemy event triggers.

![](./pools-api-diagram.png)

## API Endpoints

The `{chainId}` in each endpoint is the chain/network number you wish to request from. 1 for Mainnet, 137 for Polygon, 42161 for Arbitrum etc.

- `/pools/{chainId}/update` - Runs the worker lambda that fetches the latest pool information from the graph and saves it in the database.
- `/pools/{chainId}` - Returns a JSON array of all Balancer pools of that chain
- `/pools/{chainId}/{id}` - Returns JSON information about a pool of a specific `id`.
- `/sor/{chainId}` - Run a SOR (Smart Order Router) query against the balancer pools, more information below.
- `/tokens/{chainId}` - Returns a JSON array of all known tokens of that chain
- `/tokens/update/` - Runs the worker lambda that for every known token, fetches the latest price (in the chains native asset) from coingecko and saves it in the database.

### Update Pools Lambda

The update lambda is not called automatically, you must call it to initially poplate the database. We recommend connecting a webhook to
this endpoint that runs with every new Ethereum block, or whenever a transaction is made to the [Balancer Vault Contract](https://etherscan.io/address/0xba12222222228d8ba445958a75a0704d566bf2c8).

Example pools update

```sh
curl -X POST $ENDPOINT_URL/pools/1/update
```

On success this will return a 201 code and no other data.

### Get Pools Examples

Retrieve JSON array of all pools

```sh
curl $ENDPOINT_URL/pools/1
```

Retrieve JSON object describing a single pool

```sh
curl $ENDPOINT_URL/pools/1/0x5aa90c7362ea46b3cbfbd7f01ea5ca69c98fef1c000200000000000000000020
```

### Update Token Prices Lambda

The lambda is automatically called every 30 seconds.

Example token prices update

```sh
curl -X POST $ENDPOINT_URL/tokens/update/
```

On success this will return a 201 code and no other data.

### Smart Order Router Queries

The [Smart Order Router](https://github.com/balancer-labs/balancer-sor) is a package created by Balancer that, for any given
input and output token, finds you the best trade path across all Balancer pools. It is used by the Balancer frontend to calculate
trades.

You can POST the following JSON content to the endpoint to return smart order router information.

```js
{
    sellToken: string<Address>, # The address of the token you wish to sell
    buyToken: string<Address>, # The address of the token you wish to buy
    orderKind: string<buy|sell>, # Either 'buy' or 'sell', described further below
    amount: int, # The amount in sellToken or buyToken that you wish to sell/buy
    gasPrice: int, # The current gas price in wei, this is used to ensure your trade is most efficient considering the gas cost of performing multiple swaps.
}
```

Order Kind - Set to 'buy' to buy the exact amount of your `buyToken` and sell as little as possible to get that. Set to 'sell' to sell the exact amount of your `sellToken` and buy as much as you can with that.

### Smart Order Router Examples

#### Swap BAL for DAI

```sh
curl -X POST -H "Content-Type: application/json" -d '{"sellToken":"0xba100000625a3754423978a60c9317c58a424e3d","buyToken":"0x6b175474e89094c44da98b954eedeac495271d0f","orderKind":"sell", "amount":"1000000000000000000", "gasPrice":"10000000"}' $ENDPOINT_URL/sor/1
```

#### Swap USDC for DAI

```sh
curl -X POST -H "Content-Type: application/json" -d '{"sellToken":"0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48","buyToken":"0x6b175474e89094c44da98b954eedeac495271d0f","orderKind":"sell", "amount":"100000", "gasPrice":"10000000"}' $ENDPOINT_URL/sor/1
```

#### Swap WETH for an exact amount of BAL

```sh
curl -X POST -H "Content-Type: application/json" -d '{"sellToken":"0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2","buyToken":"0xba100000625a3754423978a60c9317c58a424e3d","orderKind":"buy", "amount":"1000000000000000000", "gasPrice":"10000000"}' $ENDPOINT_URL/sor/1
```

#### Swap BAL for DAI on the Polygon network

```sh
curl -X POST -H "Content-Type: application/json" -d '{"sellToken":"0x9a71012B13CA4d3D0Cdc72A177DF3ef03b0E76A3","buyToken":"0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174","orderKind":"sell", "amount":"1000000000000000000", "gasPrice":"10000000"}' $ENDPOINT_URL/sor/137
```

#### Swap WETH for BAL on the Arbitrum network

```sh
curl -X POST -H "Content-Type: application/json" -d '{"sellToken":"0x82af49447d8a07e3bd95bd0d56f35241523fbab1","buyToken":"0x040d1EdC9569d4Bab2D15287Dc5A4F10F56a56B8","orderKind":"sell", "amount":"1000000000000000000", "gasPrice":"10000000"}' $ENDPOINT_URL/sor/42161
 ```


