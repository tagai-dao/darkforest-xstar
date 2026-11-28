import { address, locationIdFromHexStr } from "@df/serde";
import { ArrivalType, type QueuedArrival, type VoyageId } from "@df/types";
import { recordToLog } from "@latticexyz/store-sync";
import mudConfig from "contracts/mud.config";
import { toHex } from "viem";
import { describe, expect, it } from "vitest";

import { asActionRecord, readWalletActions } from "../Save/FileChunkSource";
import { LocalVoyages } from "./LocalVoyages";

const world = "0x0000000000000000000000000000000000001234";
const captain = "0x000000000000000000000000000000000000abcd";
const { Move, Ticker } = mudConfig.namespaces.df.tables;
const fromHash = toHex(12n, { size: 32 });
const toHash = toHex(23n, { size: 32 });
const from = {
  hash: locationIdFromHexStr(fromHash),
  coords: { x: -20, y: 30 },
  perlin: 12,
  biomebase: 16,
};
const to = {
  hash: locationIdFromHexStr(toHash),
  coords: { x: 220, y: 130 },
  perlin: 12,
  biomebase: 16,
};
const tx = toHex(172n, { size: 32 });
const now = 1_790_000_000_000;

const context = {
  getPlanetWithCoords: ({ x, y }: { x: number; y: number }) => {
    const match = [from, to].find(
      (location) => location.coords.x === x && location.coords.y === y,
    );
    return match && { locationId: match.hash };
  },
  getLocationOfPlanet: (id: string) =>
    [from, to].find((location) => location.hash === id),
  getTimeForMove: () => 10,
};

const action = {
  action: "move",
  tx,
  time: new Date(now - 1000).toISOString(),
  detail: "125,000 energy, 300 silver from (-20, 30) to (220, 130)",
  to: to.hash,
};

const voyage: QueuedArrival = {
  eventId: "5" as VoyageId,
  player: address(captain),
  fromPlanet: from.hash,
  toPlanet: to.hash,
  energyArriving: 100,
  silverMoved: 10,
  departureTick: 10,
  arrivalTick: 50,
  distance: 0,
  arrivalType: ArrivalType.Normal,
  materialsMoved: [],
};
const chainMove = recordToLog({
  table: Move,
  address: world,
  record: {
    from: fromHash,
    to: toHash,
    index: 0,
    id: 5n,
    captain,
    departureTick: 10n,
    arrivalTick: 50n,
    population: 100000n,
    silver: 10000n,
    artifact: 0n,
  },
});

describe("Agent voyage previews", () => {
  it("starts from a newly appended action line and hands off the same animation by transaction hash", async () => {
    let file = JSON.stringify({ ...action, action: "upgrade" }) + "\n";
    const directory = {
      getFileHandle: () =>
        Promise.resolve({ getFile: () => Promise.resolve(new Blob([file])) }),
    } as unknown as FileSystemDirectoryHandle;
    const cursor = { offset: 0, homeModified: 0, homeSize: 0 };
    const local = new LocalVoyages();
    expect(await readWalletActions(directory, cursor)).toHaveLength(1);
    // A write observed in the middle of a line is left for the next poll.
    file += JSON.stringify(action);
    expect(await readWalletActions(directory, cursor)).toEqual([]);
    file += "\n";
    const [move] = await readWalletActions(directory, cursor);
    local.add(move, context, 0, now);
    expect([...local.getActive(now)]).toEqual([
      { from: from.coords, to: to.coords, energy: 125_000, progress: 0.1 },
    ]);
    expect(await readWalletActions(directory, cursor)).toEqual([]);

    local.confirmBlock(
      { blockNumber: 10n, logs: [{ ...chainMove, transactionHash: tx }] },
      now + 1000,
    );
    expect([...local.getActive(now + 1000)]).toEqual([]);
    expect(local.getVisualProgress(voyage, 0.12)).toBeCloseTo(0.2);
    expect(local.getVisualProgress(voyage, 0.56)).toBeCloseTo(0.6);

    local.add(move, context, 0, now + 2000);
    expect([...local.getActive(now + 2000)]).toEqual([]);
  });

  it("keeps independent moves on the same route and ignores logs for a transaction already synchronized", () => {
    const local = new LocalVoyages();
    const otherTx = toHex(174n, { size: 32 });
    local.confirmBlock(
      { blockNumber: 10n, logs: [{ ...chainMove, transactionHash: tx }] },
      now,
    );
    local.add(action, context, 0, now);
    expect([...local.getActive(now)]).toEqual([]);

    const other = asActionRecord({
      ...action,
      tx: otherTx,
      detail: { from: from.coords, to: to.coords, energy: 300 },
    })!;
    local.add(other, context, 0, now);
    local.add(other, context, 0, now);
    expect([...local.getActive(now)]).toHaveLength(1);
    const tick = recordToLog({
      table: Ticker,
      address: world,
      record: {
        timestamp: 1_790_000_000n,
        tickNumber: 40n,
        tickRate: 1n,
        paused: false,
      },
    });
    local.confirmBlock(
      { blockNumber: 11n, logs: [{ ...tick, transactionHash: otherTx }] },
      now,
    );
    expect([...local.getActive(now)]).toEqual([]);
  });

  it("does not preview old, malformed, or unresolved action records", () => {
    const local = new LocalVoyages();
    local.add({ ...action, tx: "0x" }, context, 0, now);
    local.add({ ...action, detail: "send 100 energy" }, context, 0, now);
    local.add(action, context, 0, now + 30_000);
    expect([...local.getActive(now)]).toEqual([]);
  });
});
