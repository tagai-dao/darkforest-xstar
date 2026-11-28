import {
  type Component,
  getComponentValue,
  setComponent,
} from "@latticexyz/recs";
import { createStoreSync } from "@latticexyz/store-sync";
import { getSnapshot } from "@latticexyz/store-sync/internal";
import {
  createStorageAdapter,
  registerComponents,
  singletonEntity,
  syncToRecs,
} from "@latticexyz/store-sync/recs";
import mudConfig from "contracts/mud.config";
import { defer, firstValueFrom, shareReplay, switchMap } from "rxjs";
import type {
  Address,
  Chain,
  Client,
  EIP1193Parameters,
  Hex,
  RpcSchemaOverride,
  Transport,
} from "viem";

import { tables } from "./extraTables";
import { world } from "./world";

type GameSyncOptions = {
  address: Address;
  publicClient: Client<Transport, Chain>;
  indexerUrl?: string;
  startBlock: bigint;
  maxBlockRange?: bigint;
};

function retryLaggingLogRequests(
  client: GameSyncOptions["publicClient"],
  signal: AbortSignal,
): GameSyncOptions["publicClient"] {
  async function request(
    args: EIP1193Parameters,
    options?: Parameters<typeof client.request>[1],
  ) {
    let delayMs = 750;
    for (;;) {
      try {
        return await client.request<RpcSchemaOverride>(
          { ...args, params: args.params },
          options,
        );
      } catch (error) {
        if (
          args.method !== "eth_getLogs" ||
          !(error instanceof Error) ||
          !error.message.includes(
            "block range extends beyond current head block",
          ) ||
          signal.aborted
        ) {
          throw error;
        }
        // The RPC can route the head and log requests to different backends.
        // Retry the same interval so MUD only advances after it receives the logs.
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
        if (signal.aborted) throw error;
        delayMs = Math.min(delayMs * 2, 6000);
      }
    }
  }
  return { ...client, request: request as typeof client.request };
}

export function syncGameStore(options: GameSyncOptions, snapshotOnly: boolean) {
  const cancellation = new AbortController();
  const publicClient = snapshotOnly
    ? retryLaggingLogRequests(options.publicClient, cancellation.signal)
    : options.publicClient;
  if (snapshotOnly) world.registerDisposer(() => cancellation.abort());
  if (!snapshotOnly || !options.indexerUrl) {
    return syncToRecs({
      ...options,
      publicClient,
      world,
      config: mudConfig,
      tables,
    });
  }

  const indexerUrl = options.indexerUrl;
  const components = registerComponents({
    world,
    config: mudConfig,
    extraTables: tables,
  });
  const { SyncProgress } = components;
  const { storageAdapter } = createStorageAdapter({
    world,
    tables: {},
    shouldSkipUpdateStream: () =>
      getComponentValue(SyncProgress, singletonEntity)?.step !== "live",
  });

  // Start the snapshot in the background so the lobby can render during download.
  const sync$ = defer(async () => {
    const { initialBlockLogs: snapshot } = await getSnapshot({
      chainId: options.publicClient.chain.id,
      indexerUrl,
      storeAddress: options.address,
    });
    const { startBlock } = options;
    const initialBlockLogs =
      snapshot.blockNumber > 0n && snapshot.blockNumber >= startBlock
        ? snapshot
        : undefined;
    return createStoreSync({
      ...options,
      publicClient,
      storageAdapter,
      indexerUrl: false,
      initialBlockLogs,
      // The snapshot already includes all writes from its last block.
      startBlock: initialBlockLogs
        ? initialBlockLogs.blockNumber + 1n
        : startBlock,
      onProgress(progress) {
        if (getComponentValue(SyncProgress, singletonEntity)?.step === "live")
          return;
        setComponent(SyncProgress, singletonEntity, progress);
        if (progress.step === "live") {
          for (const component of Object.values(components) as Component[]) {
            for (const entity of component.entities()) {
              const value = getComponentValue(component, entity);
              component.update$.next({
                component,
                entity,
                value: [value, value],
              });
            }
          }
        }
      },
    });
  }).pipe(shareReplay(1));
  const latestBlock$ = sync$.pipe(switchMap((sync) => sync.latestBlock$));
  const storedBlockLogs$ = sync$.pipe(
    switchMap((sync) => sync.storedBlockLogs$),
  );
  const subscription = storedBlockLogs$.subscribe({
    error: (error) => console.error("Game store synchronization failed", error),
  });
  const stopSync = () => subscription.unsubscribe();
  world.registerDisposer(stopSync);
  return Promise.resolve({
    components,
    latestBlock$,
    storedBlockLogs$,
    waitForTransaction: async (tx: Hex) =>
      (await firstValueFrom(sync$)).waitForTransaction(tx),
  });
}
