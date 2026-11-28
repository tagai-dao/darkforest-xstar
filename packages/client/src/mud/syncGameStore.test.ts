import { locationIdFromHexStr } from "@df/serde";
import type { QueuedArrival } from "@df/types";
import { getComponentValue } from "@latticexyz/recs";
import { storeEventsAbi } from "@latticexyz/store";
import { recordToLog, type StorageAdapterLog } from "@latticexyz/store-sync";
import { getSnapshot } from "@latticexyz/store-sync/internal";
import { singletonEntity } from "@latticexyz/store-sync/recs";
import mudConfig from "contracts/mud.config";
import {
  createPublicClient,
  custom,
  encodeAbiParameters,
  encodeEventTopics,
  type Hex,
  RpcRequestError,
  toHex,
} from "viem";
import { bsc } from "viem/chains";
import { afterEach, expect, it, vi } from "vitest";

import { LocalVoyages } from "../Backend/GameLogic/LocalVoyages";
import { MoveUtils } from "../Backend/GameLogic/MoveUtils";
import { VoyageRenderer } from "../Shared/renderer/Entities/VoyageRenderer";
import { syncGameStore } from "./syncGameStore";
import { world } from "./world";

vi.mock("@latticexyz/store-sync/internal", () => ({ getSnapshot: vi.fn() }));
vi.mock("@frontend/Panes/PlanetMaterialsPane", () => ({
  getMaterialColor: () => "#ffffff",
}));

afterEach(() => {
  vi.unstubAllGlobals();
  world.dispose();
});

const address = "0x0000000000000000000000000000000000001234";
const captain = "0x000000000000000000000000000000000000abcd" as const;
const { Move, PendingMove, Ticker } = mudConfig.namespaces.df.tables;

function rawLog(
  record: Extract<StorageAdapterLog, { eventName: "Store_SetRecord" }>,
  block: bigint,
  index: number,
) {
  const { tableId, keyTuple, staticData, encodedLengths, dynamicData } =
    record.args;
  return {
    address: record.address,
    topics: encodeEventTopics({
      abi: storeEventsAbi,
      eventName: "Store_SetRecord",
      args: { tableId },
    }),
    data: encodeAbiParameters(
      [
        { type: "bytes32[]" },
        { type: "bytes" },
        { type: "bytes32" },
        { type: "bytes" },
      ],
      [keyTuple, staticData, encodedLengths, dynamicData],
    ),
    transactionHash: toHex(block, { size: 32 }),
    blockNumber: toHex(block),
    transactionIndex: "0x0",
    logIndex: toHex(index),
    blockHash: toHex(block, { size: 32 }),
    removed: false,
  };
}

it("hands off a local animation once the retry succeeds and the fleet queue is applied", async () => {
  const openEventSource = vi.fn();
  vi.stubGlobal("EventSource", openEventSource);
  const from = toHex(12n, { size: 32 });
  const to = toHex(23n, { size: 32 });
  const ticker = {
    tickNumber: 105n,
    tickRate: 1n,
    timestamp: 1_790_000_000n,
    paused: false,
  };
  const move = {
    from,
    to,
    captain,
    index: 0,
    id: 1n,
    departureTick: ticker.tickNumber,
    arrivalTick: 165n,
    population: 1200n,
    silver: 500n,
    artifact: 0n,
  };
  vi.mocked(getSnapshot).mockResolvedValue({
    initialBlockLogs: {
      blockNumber: 1000n,
      logs: [recordToLog({ table: Ticker, record: ticker, address })],
    },
  });

  const ranges: [bigint, bigint][] = [];
  const rejected: [bigint, bigint][] = [];
  let head = 1601n;
  let logHead = head;
  const moveBlock = 1605n;
  const liveLogs = [
    rawLog(recordToLog({ table: Move, record: move, address }), moveBlock, 0),
    rawLog(
      recordToLog({
        table: PendingMove,
        record: { to, head: 0, number: 1, indexes: 0n },
        address,
      }),
      moveBlock,
      1,
    ),
  ];
  const rpc = createPublicClient({
    chain: bsc,
    pollingInterval: 10,
    transport: custom({
      request({ method, params }) {
        if (method === "eth_getBlockByNumber") {
          return Promise.resolve({
            number: toHex(head),
            timestamp: toHex(ticker.timestamp),
            hash: toHex(head, { size: 32 }),
          });
        }
        if (method === "eth_getLogs") {
          const [query] = params as [
            { address: Hex; fromBlock: Hex; toBlock: Hex },
          ];
          expect(query.address).toBe(address);
          const fromBlock = BigInt(query.fromBlock);
          const toBlock = BigInt(query.toBlock);
          ranges.push([fromBlock, toBlock]);
          if (toBlock > logHead) {
            rejected.push([fromBlock, toBlock]);
            throw new RpcRequestError({
              body: { method, params },
              error: {
                code: -32602,
                message: `block range extends beyond current head block: requested ${toBlock}, head ${logHead}`,
              },
              url: "https://public-rpc.example.test",
            });
          }
          return Promise.resolve(
            fromBlock <= moveBlock && moveBlock <= toBlock ? liveLogs : [],
          );
        }
        throw new Error(`Unexpected RPC method: ${method}`);
      },
    }),
  });

  const sync = await syncGameStore(
    {
      address,
      publicClient: rpc,
      startBlock: 12n,
      maxBlockRange: 500n,
      indexerUrl: "https://indexer.example.test",
    },
    true,
  );
  const components = { ...sync.components, getChainClockOffsetMs: () => 0 };
  const moveUtils = new MoveUtils({ components });
  let voyages: QueuedArrival[] = [];
  const updates = moveUtils.observeQueuedArrivals().subscribe(({ toId }) => {
    voyages = moveUtils.getArrivalsForPlanet(toId);
  });
  const localVoyages = new LocalVoyages();
  const origin = { x: 20, y: 30 };
  const destination = { x: 220, y: 130 };
  const fromId = locationIdFromHexStr(from);
  const drawFleetMarker = vi.fn();
  const queueLineWorld = vi.fn();
  const renderer = {
    currentTick: 135,
    now: 135_000,
    context: {
      localVoyages,
      getAccount: () => captain,
      getPlayer: () => undefined,
      getAllVoyages: () => voyages,
      getUnconfirmedMoves: () => [],
      getPlanetWithId: () => ({ owner: captain }),
      getLocationOfPlanet: (id: string) => ({
        coords: id === fromId ? origin : destination,
      }),
      inSameGuildAtTick: () => false,
      convertTickToMs: (tick: number) => tick * 1000,
      getIsHighPerfMode: () => false,
    },
    getViewport: () => ({
      viewportWidth: 320,
      viewportHeight: 240,
      worldToCanvasCoords: (point: object) => point,
      canvasToWorldCoords: (point: object) => point,
    }),
    lineRenderer: { queueLineWorld },
    overlay2dRenderer: { drawFleetMarker },
    textRenderer: { queueTextWorld: vi.fn() },
  };

  const voyageRenderer = new VoyageRenderer({
    renderer,
  } as unknown as ConstructorParameters<typeof VoyageRenderer>[0]);
  const confirmations = sync.storedBlockLogs$.subscribe((block) =>
    localVoyages.confirmBlock(block, renderer.now),
  );
  const resolveLocation = (id: typeof fromId) => ({
    hash: id,
    perlin: 12,
    biomebase: 16,
    coords: id === fromId ? origin : destination,
  });
  try {
    await vi.waitFor(() =>
      expect(
        getComponentValue(sync.components.SyncProgress, singletonEntity)?.step,
      ).toBe("live"),
    );
    expect(ranges).toEqual([
      [1001n, 1500n],
      [1501n, 1600n],
      [1601n, 1601n],
    ]);
    expect(openEventSource).not.toHaveBeenCalled();

    head = 1607n;
    await vi.waitFor(() => expect(rejected).toEqual([[1602n, 1606n]]));
    expect(voyages).toEqual([]);
    const action = {
      action: "move",
      tx: toHex(moveBlock, { size: 32 }),
      time: new Date(124_000).toISOString(),
      detail: "1200 energy",
      from,
      to,
    };
    localVoyages.add(
      action,
      {
        getPlanetWithCoords: () => undefined,
        getLocationOfPlanet: resolveLocation,
        getTimeForMove: () => 55,
      },
      0,
      renderer.now,
    );
    voyageRenderer.queueVoyages();
    expect(drawFleetMarker).toHaveBeenCalledTimes(1);
    expect(drawFleetMarker.mock.calls[0][0]).toEqual({ x: 60, y: 50 });
    drawFleetMarker.mockClear();
    queueLineWorld.mockClear();

    logHead = head;
    await vi.waitFor(() => expect(voyages).toHaveLength(1), { timeout: 2000 });
    expect(ranges.slice(3)).toEqual([
      [1602n, 1606n],
      [1602n, 1606n],
      [1607n, 1607n],
    ]);
    expect(getSnapshot).toHaveBeenCalledOnce();

    voyageRenderer.queueVoyages();
    expect(drawFleetMarker).toHaveBeenCalledTimes(1);
    expect(queueLineWorld).toHaveBeenCalledWith(
      origin,
      destination,
      expect.any(Array),
      expect.any(Number),
      expect.any(Number),
    );
    expect(drawFleetMarker).toHaveBeenCalledWith(
      { x: 60, y: 50 },
      origin,
      destination,
      expect.any(Array),
      expect.any(String),
      false,
      false,
    );

    head = logHead = 1608n;
    await vi.waitFor(() => expect(ranges.at(-1)).toEqual([1608n, 1608n]));
  } finally {
    confirmations.unsubscribe();
    updates.unsubscribe();
  }
});
