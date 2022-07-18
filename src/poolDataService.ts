import { PoolDataService, SubgraphPoolBase } from "@balancer-labs/sor";
import { ChainId } from "@koyofinance/core-sdk";
import { getPools } from "./dynamodb";

interface DatabasePoolDataServiceConfig {
    chainId: ChainId;
}

export class DatabasePoolDataService implements PoolDataService {
    private readonly chainId: ChainId;

    constructor(readonly config: DatabasePoolDataServiceConfig) {
        this.chainId = config.chainId;
    }

    public async getPools(): Promise<SubgraphPoolBase[]> {
        console.log(
            `Retrieving pools for chain ${this.chainId} from the database`
        );
        const pools = await getPools(this.chainId);
        console.log(`Retrieved ${pools.length} pools`);
        return pools ?? [];
    }
}
