import { mudFoundry } from "@latticexyz/common/chains";
import { createPublicClient, type Hex, http } from "viem";

import { BOARD_LOG_NAME, parseBoardLog } from "./BoardLog";
import {
  decideGameStatus,
  endedGameNotice,
  type GameId,
  type GameSaveFiles,
  parseGameFile,
  parseGameFolderName,
  parseGameSave,
  playedSaveBelongsToChain,
} from "./GameSave";

const SPAWN_PLANET_TABLE =
  "0x74626466000000000000000000000000537061776e506c616e65740000000000";

const worldAbi = [
  {
    type: "function",
    name: "getRecord",
    stateMutability: "view",
    inputs: [
      { name: "tableId", type: "bytes32" },
      { name: "keyTuple", type: "bytes32[]" },
    ],
    outputs: [
      { name: "staticData", type: "bytes" },
      { name: "encodedLengths", type: "bytes32" },
      { name: "dynamicData", type: "bytes" },
    ],
  },
] as const;

export type LoadProgress = {
  done: number;
  total: number;
  label: string;
};

export type LoadedGame = {
  ok: true;
  game: GameId;
  save: GameSaveFiles;
  homeReady: boolean;
  directory: DirectoryHandle;
  /** knownBoard.ndjson 里已经读完的字节。下一轮只读这之后的内容。 */
  boardOffset: number;
};

export type RejectedGame = {
  ok: false;
  title: string;
  detail: string;
  reason: "ended" | "other";
};

type DirectoryHandle = FileSystemDirectoryHandle;

async function listFiles(
  dir: DirectoryHandle,
  prefix: string,
  skipBoardDir: boolean,
): Promise<{ path: string; handle: FileSystemFileHandle }[]> {
  const files: { path: string; handle: FileSystemFileHandle }[] = [];
  for await (const [name, handle] of dir.entries()) {
    // 地图已经收成一个日志时，不再打开 knownBoard 里的旧文件。
    if (skipBoardDir && prefix === "" && name === "knownBoard") {
      continue;
    }
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "file") {
      files.push({ path, handle: handle as FileSystemFileHandle });
    } else {
      files.push(
        ...(await listFiles(handle as DirectoryHandle, path, skipBoardDir)),
      );
    }
  }
  return files;
}

async function readFiles(
  entries: { path: string; handle: FileSystemFileHandle }[],
  onProgress: (progress: LoadProgress) => void,
): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  let done = 0;
  for (const entry of entries) {
    files.set(entry.path, await (await entry.handle.getFile()).text());
    done += 1;
    onProgress({
      done,
      total: entries.length,
      label: "正在读取文件",
    });
  }
  return files;
}

function addressKey(player: string): Hex {
  return `0x${player.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}

function uint256FromStatic(data: Hex): bigint {
  if (!data || data === "0x") {
    return 0n;
  }
  return BigInt(data);
}

async function readSpawnPlanet(world: string, player: string): Promise<bigint> {
  const client = createPublicClient({
    chain: mudFoundry,
    transport: http("http://localhost:8545"),
  });
  const record = await client.readContract({
    address: world as Hex,
    abi: worldAbi,
    functionName: "getRecord",
    args: [SPAWN_PLANET_TABLE as Hex, [addressKey(player)]],
  });
  return uint256FromStatic(record[0]);
}

async function walletDirectories(
  root: DirectoryHandle,
): Promise<DirectoryHandle[]> {
  const wallets: DirectoryHandle[] = [];
  for await (const [, handle] of root.entries()) {
    if (handle.kind !== "directory") {
      continue;
    }
    const dir = handle as DirectoryHandle;
    try {
      await dir.getFileHandle("agent.json");
      wallets.push(dir);
    } catch {
      // 这一层不是钱包目录。
    }
  }
  return wallets;
}

export async function loadSelectedGame(
  root: DirectoryHandle,
  liveGame: { chainId: number; world: string },
  onProgress: (progress: LoadProgress) => void,
): Promise<LoadedGame | RejectedGame> {
  onProgress({ done: 0, total: 0, label: "正在查看目录" });
  const folderGame = parseGameFolderName(root.name);
  let wallet = root;
  let game = folderGame;

  if (folderGame) {
    const wallets = await walletDirectories(root);
    if (wallets.length === 0) {
      return {
        ok: false,
        reason: "other",
        title: "游戏还未开始",
        detail: "这个游戏目录里还没有钱包存档。",
      };
    }
    if (wallets.length > 1) {
      return {
        ok: false,
        reason: "other",
        title: "请改选钱包目录",
        detail: "这个游戏目录里有多个钱包。请选择其中一个钱包目录。",
      };
    }
    wallet = wallets[0];
  }

  let gameText: string | undefined;
  try {
    const handle = await wallet.getFileHandle("game.json");
    gameText = await (await handle.getFile()).text();
  } catch {
    gameText = undefined;
  }
  if (gameText) {
    try {
      game = parseGameFile(gameText);
    } catch (error) {
      return {
        ok: false,
        reason: "other",
        title: "存档无法读取",
        detail: error instanceof Error ? error.message : "game.json 无法读取",
      };
    }
  }
  if (!game) {
    return {
      ok: false,
      reason: "other",
      title: "游戏还未开始",
      detail: "这份存档没有 game.json，看不出是哪一局。",
    };
  }

  let hasBoardLog = false;
  try {
    await wallet.getFileHandle(BOARD_LOG_NAME);
    hasBoardLog = true;
  } catch {
    hasBoardLog = false;
  }
  const entries = await listFiles(wallet, "", hasBoardLog);
  const files = await readFiles(entries, onProgress);
  if (!files.has("agent.json")) {
    return {
      ok: false,
      reason: "other",
      title: "游戏还未开始",
      detail: "目录里没有 agent.json。",
    };
  }

  // 链 ID 和 World 对得上才是这一局；对不上的存档不再使用。
  const status = decideGameStatus(game, liveGame);
  if (status === "ended") {
    return { ok: false, reason: "ended", ...endedGameNotice };
  }

  const save = parseGameSave(files);
  if (save.homeLocations.length > 0) {
    let spawnPlanet: bigint;
    try {
      spawnPlanet = await readSpawnPlanet(liveGame.world, save.agent.address);
    } catch {
      return {
        ok: false,
        reason: "other",
        title: "读不到当前游戏",
        detail: "链上读不到这只钱包的出生星。",
      };
    }
    if (!playedSaveBelongsToChain(true, spawnPlanet)) {
      return { ok: false, reason: "ended", ...endedGameNotice };
    }
  }

  let boardOffset = 0;
  const log = files.get(BOARD_LOG_NAME);
  if (log !== undefined) {
    const parsed = parseBoardLog(log);
    save.chunks = parsed.chunks;
    boardOffset = parsed.byteLength;
  }
  return {
    ok: true,
    game,
    save,
    homeReady: save.homeLocations.length > 0,
    directory: wallet,
    boardOffset,
  };
}
