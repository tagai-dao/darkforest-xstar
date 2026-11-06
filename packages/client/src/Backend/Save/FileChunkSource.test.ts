import { describe, expect, it } from "vitest";

import {
  chunksToStoreRecords,
  loadWalletSave,
  pathsToReread,
  readWatchedHome,
} from "./FileChunkSource";
import { serializeGameSave } from "./GameSave";

describe("file chunk source", () => {
  it("loads the agent address and chunks from a directory reader", async () => {
    const files = serializeGameSave({
      agent: { address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" },
      chunks: [{ x: 0, y: 0, s: 16, l: [], p: 3 }],
      homeLocations: [],
      pendingTxs: [],
    });
    const reader = {
      list: async () => [...files.keys()],
      read: async (path: string) => files.get(path) ?? "",
    };
    const save = await loadWalletSave(reader);
    expect(save.agent.address).toBe(
      "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
    );
    expect(save.chunks).toHaveLength(1);
  });

  it("turns persisted chunks into store records keyed by footprint", () => {
    const records = chunksToStoreRecords([{ x: 4, y: 8, s: 16, l: [], p: 2 }]);
    expect(records.get("4,8,16")?.s).toBe(16);
  });

  it("rereads a file only when its time or size changes", () => {
    const stamps = new Map([
      ["knownBoard/0_0_16.json", { modified: 10, size: 20 }],
    ]);
    const next = pathsToReread(
      [
        { path: "knownBoard/0_0_16.json", modified: 10, size: 20 },
        { path: "knownBoard/16_0_16.json", modified: 11, size: 20 },
        { path: "homeLocations.json", modified: 10, size: 21 },
      ],
      stamps,
    );
    expect(next).toEqual(["knownBoard/16_0_16.json", "homeLocations.json"]);
  });

  it("reads the first saved home", () => {
    expect(readWatchedHome(undefined)).toBeUndefined();
    expect(
      readWatchedHome(
        JSON.stringify([
          {
            coords: { x: 80012, y: 3 },
            hash: "ab",
            perlin: 12,
            biomebase: 9,
          },
        ]),
      )?.coords,
    ).toEqual({ x: 80012, y: 3 });
  });
});
