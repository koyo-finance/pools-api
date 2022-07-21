require("dotenv").config();
import { App, Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import {
    IResource,
    LambdaIntegration,
    MockIntegration,
    PassthroughBehavior,
    RestApi
} from "aws-cdk-lib/aws-apigateway";
import { AttributeType, Table } from "aws-cdk-lib/aws-dynamodb";
import { Rule, Schedule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import {
    NodejsFunction,
    NodejsFunctionProps
} from "aws-cdk-lib/aws-lambda-nodejs";
import { join } from "path";

const {
    BOBA_RPC,
    AURORA_RPC,
    MOONRIVER_RPC,
    POLYGON_RPC,
    POOLS_API_DDB_READ_CAPACITY,
    POOLS_API_DDB_WRITE_CAPACITY,
} = process.env;

const READ_CAPACITY = POOLS_API_DDB_READ_CAPACITY || "10";
const WRITE_CAPACITY = POOLS_API_DDB_WRITE_CAPACITY || "10";

export class KoyoPoolsAPI extends Stack {
    constructor(app: App, id: string) {
        super(app, id);

        /**
         * DynamoDB Tables
         */

        const poolsTable = new Table(this, "pools", {
            partitionKey: {
                name: "id",
                type: AttributeType.STRING,
            },
            sortKey: {
                name: "chainId",
                type: AttributeType.NUMBER,
            },
            tableName: "pools",
            removalPolicy: RemovalPolicy.DESTROY,
            readCapacity: Number.parseInt(READ_CAPACITY),
            writeCapacity: Number.parseInt(WRITE_CAPACITY),
        });

        const tokensTable = new Table(this, "tokens", {
            partitionKey: {
                name: "address",
                type: AttributeType.STRING,
            },
            sortKey: {
                name: "chainId",
                type: AttributeType.NUMBER,
            },
            tableName: "tokens",
            removalPolicy: RemovalPolicy.DESTROY,
            readCapacity: Number.parseInt(READ_CAPACITY),
            writeCapacity: Number.parseInt(WRITE_CAPACITY),
        });

        /**
         * Lambdas
         */

        const nodeJsFunctionProps: NodejsFunctionProps = {
            bundling: {
                externalModules: ["aws-sdk"],
            },
            environment: {
                BOBA_RPC: BOBA_RPC || "",
                AURORA_RPC: AURORA_RPC || "",
                MOONRIVER_RPC: MOONRIVER_RPC || "",
                POLYGON_RPC: POLYGON_RPC || "",
            },
            runtime: Runtime.NODEJS_14_X,
            timeout: Duration.seconds(15),
            reservedConcurrentExecutions: 1,
        };

        const getPoolLambda = new NodejsFunction(this, "getPoolFunction", {
            entry: join(__dirname, "lambdas", "get-pool.ts"),
            ...nodeJsFunctionProps,
        });
        const getPoolsLambda = new NodejsFunction(this, "getPoolsFunction", {
            entry: join(__dirname, "lambdas", "get-pools.ts"),
            ...nodeJsFunctionProps,
        });
        const getTokensLambda = new NodejsFunction(this, "getTokensFunction", {
            entry: join(__dirname, "lambdas", "get-tokens.ts"),
            ...nodeJsFunctionProps,
        });
        const runSORLambda = new NodejsFunction(this, "runSORFunction", {
            entry: join(__dirname, "lambdas", "run-sor.ts"),
            ...nodeJsFunctionProps,
            memorySize: 2048,
        });
        const updatePoolsLambda = new NodejsFunction(
            this,
            "updatePoolsFunction",
            {
                entry: join(__dirname, "lambdas", "update-pools.ts"),
                ...nodeJsFunctionProps,
                memorySize: 2048,
                timeout: Duration.seconds(60),
                reservedConcurrentExecutions: 1,
            }
        );

        const updateTokenPricesLambda = new NodejsFunction(
            this,
            "updateTokenPricesFunction",
            {
                entry: join(__dirname, "lambdas", "update-prices.ts"),
                ...nodeJsFunctionProps,
                memorySize: 512,
                timeout: Duration.seconds(60),
            }
        );

        /**
         * Lambda Schedules
         */

        const rule = new Rule(this, "updateTokenPricesEachMinute", {
            schedule: Schedule.expression("rate(1 minute)"),
        });
        rule.addTarget(new LambdaFunction(updateTokenPricesLambda));

        /**
         * Access Rules
         */

        poolsTable.grantReadData(getPoolsLambda);
        poolsTable.grantReadData(getPoolLambda);
        poolsTable.grantReadWriteData(runSORLambda);
        poolsTable.grantReadWriteData(updatePoolsLambda);

        tokensTable.grantReadData(getTokensLambda);
        tokensTable.grantReadWriteData(runSORLambda);
        tokensTable.grantReadWriteData(updatePoolsLambda);
        tokensTable.grantReadWriteData(updateTokenPricesLambda);

        /**
         * API Gateway
         */

        const getPoolIntegration = new LambdaIntegration(getPoolLambda);
        const getPoolsIntegration = new LambdaIntegration(getPoolsLambda);
        const getTokensIntegration = new LambdaIntegration(getTokensLambda);
        const runSORIntegration = new LambdaIntegration(runSORLambda);
        const updatePoolsIntegration = new LambdaIntegration(
            updatePoolsLambda,
            {
                timeout: Duration.seconds(29),
            }
        );
        const updateTokenPricesIntegration = new LambdaIntegration(
            updateTokenPricesLambda,
            { timeout: Duration.seconds(29) }
        );

        const api = new RestApi(this, "poolsApi", {
            restApiName: "Pools Service",
        });

        const pools = api.root.addResource("pools");
        const poolsOnChain = pools.addResource("{chainId}");
        poolsOnChain.addMethod("GET", getPoolsIntegration);
        addCorsOptions(pools);

        const updatePools = poolsOnChain.addResource("update");
        updatePools.addMethod("POST", updatePoolsIntegration);
        addCorsOptions(updatePools);

        const singlePool = poolsOnChain.addResource("{id}");
        singlePool.addMethod("GET", getPoolIntegration);
        addCorsOptions(singlePool);

        const tokens = api.root.addResource("tokens");
        const tokensOnChain = tokens.addResource("{chainId}");
        tokensOnChain.addMethod("GET", getTokensIntegration);
        addCorsOptions(tokens);

        const updatePrices = tokens.addResource("update");
        updatePrices.addMethod("POST", updateTokenPricesIntegration);
        addCorsOptions(updatePrices);

        const sor = api.root.addResource("sor");
        const sorOnChain = sor.addResource("{chainId}");
        sorOnChain.addMethod("POST", runSORIntegration);
        addCorsOptions(sor);

        const gnosis = api.root.addResource("gnosis");
        const gnosisOnChain = gnosis.addResource("{chainId}");
        gnosisOnChain.addMethod("POST", runSORIntegration);
        addCorsOptions(gnosis);
    }
}

export function addCorsOptions(apiResource: IResource) {
    apiResource.addMethod(
        "OPTIONS",
        new MockIntegration({
            integrationResponses: [
                {
                    statusCode: "200",
                    responseParameters: {
                        "method.response.header.Access-Control-Allow-Headers":
                            "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent'",
                        "method.response.header.Access-Control-Allow-Origin":
                            "'*'",
                        "method.response.header.Access-Control-Allow-Credentials":
                            "'false'",
                        "method.response.header.Access-Control-Allow-Methods":
                            "'OPTIONS,GET,PUT,POST,DELETE'",
                    },
                },
            ],
            passthroughBehavior: PassthroughBehavior.NEVER,
            requestTemplates: {
                "application/json": '{"statusCode": 200}',
            },
        }),
        {
            methodResponses: [
                {
                    statusCode: "200",
                    responseParameters: {
                        "method.response.header.Access-Control-Allow-Headers":
                            true,
                        "method.response.header.Access-Control-Allow-Methods":
                            true,
                        "method.response.header.Access-Control-Allow-Credentials":
                            true,
                        "method.response.header.Access-Control-Allow-Origin":
                            true,
                    },
                },
            ],
        }
    );
}

const app = new App();
new KoyoPoolsAPI(app, "KoyoPoolsAPI");
app.synth();
