import { describe, expect, it } from "vitest";

import { boardLine, parseBoardLog } from "./BoardLog";
import { memoryChunkStoreFromSave } from "./FileChunkSource";

const chunk = { x: 79936, y: 48, s: 16, l: [], p: 17.14 };

describe("board log", () => {
  it("keeps a trailing partial line for the next read", () => {
    const full = boardLine(chunk);
    const parsed = parseBoardLog(`${full}{"x":1`);
    expect(parsed.chunks).toEqual([chunk]);
    expect(parsed.byteLength).toBe(full.length);
  });

  it("skips a broken line and still moves past it", () => {
    const parsed = parseBoardLog(`{not json}\n${boardLine(chunk)}`);
    expect(parsed.chunks).toEqual([chunk]);
    expect(parsed.byteLength).toBe(`{not json}\n${boardLine(chunk)}`.length);
  });

  it("finds a chunk from the cell under the camera and not from the origin", () => {
    const store = memoryChunkStoreFromSave({
      agent: { address: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266" },
      chunks: [chunk],
      homeLocations: [],
      pendingTxs: [],
    });
    expect(store.chunksNear?.(79900, 0, 80000, 100)).toHaveLength(1);
    expect(store.chunksNear?.(-10, -10, 10, 10)).toHaveLength(0);
  });

  it("loads each stored chunk without merging", () => {
    const store = memoryChunkStoreFromSave({
      agent: { address: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266" },
      chunks: [
        { x: 0, y: 0, s: 16, l: [], p: 1 },
        { x: 16, y: 0, s: 16, l: [], p: 1 },
        { x: 0, y: 16, s: 16, l: [], p: 1 },
        { x: 16, y: 16, s: 16, l: [], p: 1 },
      ],
      homeLocations: [],
      pendingTxs: [],
    });
    expect(store.chunksNear?.(0, 0, 32, 32)).toHaveLength(4);
  });
});
