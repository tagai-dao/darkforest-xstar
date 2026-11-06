import { describe, expect, it } from "vitest";

import {
  appendChunk,
  decideGameStatus,
  gameFolderName,
  parseGameFile,
  parseGameFolderName,
  parseGameSave,
  parseJsonLines,
  serializeGameSave,
  walletFolderName,
} from "./GameSave";

describe("game folder names", () => {
  const game = {
    chainId: 31337,
    world: "0xbe09885633Df7DfEfB96517cd6547fd4516A2907",
    season: 1,
  };

  it("names a season folder from chain, world, and season", () => {
    expect(gameFolderName(game)).toBe(
      "31337-0xbe09885633df7dfefb96517cd6547fd4516a2907-1",
    );
  });

  it("puts one wallet inside that season", () => {
    expect(
      walletFolderName({
        game,
        wallet: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      }),
    ).toBe(
      "31337-0xbe09885633df7dfefb96517cd6547fd4516a2907-1/0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
    );
  });
});

const wallet = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

describe("game save files", () => {
  it("round-trips the private map without a private key", () => {
    const files = serializeGameSave({
      agent: { address: wallet },
      chunks: [{ x: 0, y: 0, s: 16, l: [], p: 10 }],
      homeLocations: [],
      pendingTxs: [],
    });

    expect(files.has("skey")).toBe(false);
    expect(JSON.parse(files.get("agent.json")!).address).toBe(
      "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
    );
    expect(files.get("knownBoard/0_0_16.json")).toContain('"s":16');

    const loaded = parseGameSave(files);
    expect(loaded.chunks).toEqual([{ x: 0, y: 0, s: 16, l: [], p: 10 }]);
  });

  it("replaces a chunk with the same footprint", () => {
    let files = serializeGameSave({
      agent: { address: wallet },
      chunks: [{ x: 1, y: 2, s: 16, l: [], p: 1 }],
      homeLocations: [],
      pendingTxs: [],
    });
    files = appendChunk(files, { x: 1, y: 2, s: 16, l: [], p: 9 });
    expect(parseGameSave(files).chunks).toEqual([
      { x: 1, y: 2, s: 16, l: [], p: 9 },
    ]);
  });

  it("drops a torn trailing json line", () => {
    expect(parseJsonLines('{"ok":1}\n{"torn":')).toEqual([{ ok: 1 }]);
  });
});

describe("which game is current", () => {
  const live = {
    chainId: 31337,
    open: true,
    world: "0xfDf868Ea710FfD8cd33b829c5AFf79eDd15EcD5f",
    season: 1,
  };

  it("reads the season folder name", () => {
    expect(
      parseGameFolderName("31337-0xfDf868Ea710FfD8cd33b829c5AFf79eDd15EcD5f-1"),
    ).toEqual({
      chainId: 31337,
      world: "0xfdf868ea710ffd8cd33b829c5aff79edd15ecd5f",
      season: 1,
    });
  });

  it("accepts the open season and rejects a finished one", () => {
    const current = parseGameFile(
      '{"chainId":31337,"world":"0xfdf868ea710ffd8cd33b829c5aff79edd15ecd5f","season":1}',
    );
    expect(decideGameStatus(current, live)).toBe("current");
    expect(decideGameStatus({ ...current, season: 0 }, live)).toBe("ended");
    expect(decideGameStatus(current, { ...live, open: false, season: 0 })).toBe(
      "not-started",
    );
  });
});
