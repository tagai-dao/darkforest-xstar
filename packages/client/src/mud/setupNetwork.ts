/*
 * The MUD client code is built on top of viem
 * (https://viem.sh/docs/getting-started.html).
 * This line imports the functions we need from it.
 */

import {
  type ContractWrite,
  createBurnerAccount,
  transportObserver,
} from "@latticexyz/common";
import { transactionQueue, writeObserver } from "@latticexyz/common/actions";
import { observer } from "@latticexyz/explorer/observer";
import { encodeEntity } from "@latticexyz/store-sync/recs";
import IWorldAbi from "contracts/out/IWorld.sol/IWorld.abi.json";
import { share, Subject } from "rxjs";
import {
  type ClientConfig,
  createPublicClient,
  createWalletClient,
  getContract,
  type Hex,
  http,
} from "viem";
import { bsc } from "viem/chains";

import { LocalVoyages } from "../Backend/GameLogic/LocalVoyages";
import { getNetworkConfig } from "./getNetworkConfig";
import { syncGameStore } from "./syncGameStore";
import { world } from "./world";

export type SetupNetworkResult = Awaited<ReturnType<typeof setupNetwork>>;

export async function setupNetwork() {
  const networkConfig = getNetworkConfig();
  const isBsc = networkConfig.chain.id === bsc.id;

  /*
   * Create a viem public (read only) client
   * (https://viem.sh/docs/clients/public.html)
   */
  const clientOptions = {
    chain: networkConfig.chain,
    transport: transportObserver(http(networkConfig.provider.jsonRpcUrl)),
    pollingInterval: isBsc ? 3000 : 1000,
  } as const satisfies ClientConfig;

  const publicClient = createPublicClient(clientOptions);

  /*
   * Create an observable for contract writes that we can
   * pass into MUD dev tools for transaction observability.
   */
  const write$ = new Subject<ContractWrite>();
  const { components, latestBlock$, storedBlockLogs$, waitForTransaction } =
    await syncGameStore(
      {
        address: networkConfig.worldAddress as Hex,
        publicClient,
        indexerUrl: networkConfig.indexerUrl,
        startBlock: BigInt(networkConfig.initialBlockNumber),
        maxBlockRange: isBsc ? 500n : undefined,
      },
      isBsc,
    );

  const localVoyages = new LocalVoyages();
  const voyageSubscription = storedBlockLogs$.subscribe({
    next: (block) => localVoyages.confirmBlock(block),
    error: (error) => console.error("Unable to reconcile local voyages", error),
  });
  world.registerDisposer(() => voyageSubscription.unsubscribe());

  /*
   * Create a temporary wallet and a viem client for it
   * (see https://viem.sh/docs/clients/wallet.html).
   */
  const burnerAccount = createBurnerAccount(networkConfig.privateKey as Hex);
  const burnerWalletClient = createWalletClient({
    ...clientOptions,
    account: burnerAccount,
  })
    .extend(transactionQueue())
    .extend(writeObserver({ onWrite: (write) => write$.next(write) }))
    .extend(observer({ waitForTransaction }));

  /*
   * Create an object for communicating with the deployed World.
   */
  const worldContract = getContract({
    address: networkConfig.worldAddress as Hex,
    abi: IWorldAbi,
    client: { public: publicClient, wallet: burnerWalletClient },
  });

  return {
    world,
    worldAddress: networkConfig.worldAddress,
    components,
    playerEntity: encodeEntity(
      { address: "address" },
      { address: burnerWalletClient.account.address },
    ),
    publicClient,
    walletClient: burnerWalletClient,
    latestBlock$,
    storedBlockLogs$,
    localVoyages,
    waitForTransaction,
    worldContract,
    write$: write$.asObservable().pipe(share()),
  };
}
