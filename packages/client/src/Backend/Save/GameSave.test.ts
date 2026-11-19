import { describe, expect, it } from "vitest";

import {
  appendChunk,
  decideGameStatus,
  endedGameNotice,
  gameFolderName,
  parseGameFile,
  parseGameFolderName,
  parseGameSave,
  parseJsonLines,
  playedSaveBelongsToChain,
  serializeGameSave,
  walletFolderName,
} from "./GameSave";

describe("game folder names", () => {
  const game = {
    chainId: 31337,
    world: "0xbe09885633Df7DfEfB96517cd6547fd4516A2907",
  };

  it("names a game folder from chain and world", () => {
    expect(gameFolderName(game)).toBe(
      "31337-0xbe09885633df7dfefb96517cd6547fd4516a2907",
    );
  });

  it("puts one wallet folder inside that game folder", () => {
    expect(
      walletFolderName({
        game,
        wallet: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      }),
    ).toBe(
      "31337-0xbe09885633df7dfefb96517cd6547fd4516a2907/0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
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
    world: "0xfDf868Ea710FfD8cd33b829c5AFf79eDd15EcD5f",
  };

  it("reads the game folder name", () => {
    expect(
      parseGameFolderName("31337-0xfDf868Ea710FfD8cd33b829c5AFf79eDd15EcD5f"),
    ).toEqual({
      chainId: 31337,
      world: "0xfdf868ea710ffd8cd33b829c5aff79edd15ecd5f",
    });
  });

  it("rejects an old folder name that still ends with a season number", () => {
    expect(
      parseGameFolderName("31337-0xfDf868Ea710FfD8cd33b829c5AFf79eDd15EcD5f-1"),
    ).toBeUndefined();
  });

  it("accepts the same chain and world and rejects another one", () => {
    const current = parseGameFile(
      '{"chainId":31337,"world":"0xfdf868ea710ffd8cd33b829c5aff79edd15ecd5f"}',
    );
    expect(decideGameStatus(current, live)).toBe("current");
    expect(decideGameStatus({ ...current, chainId: 1 }, live)).toBe("ended");
    expect(
      decideGameStatus(
        { ...current, world: "0x0000000000000000000000000000000000000001" },
        live,
      ),
    ).toBe("ended");
  });

  it("refuses a game.json that still carries a season", () => {
    expect(() =>
      parseGameFile(
        '{"chainId":31337,"world":"0xfdf868ea710ffd8cd33b829c5aff79edd15ecd5f","season":1}',
      ),
    ).toThrow("旧版本");
  });

  it("treats a saved home without a spawn planet as a previous game", () => {
    expect(playedSaveBelongsToChain(false, 0n)).toBe(true);
    expect(playedSaveBelongsToChain(true, 0n)).toBe(false);
    expect(playedSaveBelongsToChain(true, 42n)).toBe(true);
    expect(endedGameNotice.title).toBe("游戏已经结束");
    expect(endedGameNotice.detail).toBe(
      "这份存档不属于链上当前这一局。请让 agent 在当前游戏里重新加入。",
    );
  });
});
