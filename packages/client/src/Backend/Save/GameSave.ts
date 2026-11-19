import type { PersistedChunk } from "../../_types/darkforest/api/ChunkStoreTypes";

export type SaveHomeLocation = {
  coords: { x: number; y: number };
  hash: string;
  perlin: number;
  biomebase: number;
};

export type PendingTxFile = {
  hash: string;
  intent: unknown;
};

export type AgentFile = {
  address: string;
};

export type GameSaveFiles = {
  agent: AgentFile;
  chunks: PersistedChunk[];
  homeLocations: SaveHomeLocation[];
  pendingTxs: PendingTxFile[];
};

// 一局游戏由链 ID 和 World 地址确定。钱包子目录放在这一局下面，同一台电脑可以放多个钱包。
export type GameId = {
  chainId: number;
  world: string;
};

export type WalletSaveRef = {
  game: GameId;
  wallet: string;
};

function address(value: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`Invalid address: ${value}`);
  }
  return value.toLowerCase();
}

export function gameFolderName(game: GameId): string {
  return `${game.chainId}-${address(game.world)}`;
}

export function walletFolderName(ref: WalletSaveRef): string {
  return `${gameFolderName(ref.game)}/${address(ref.wallet)}`;
}

export function parseGameFolderName(name: string): GameId | undefined {
  const match = /^(\d+)-(0x[0-9a-fA-F]{40})$/.exec(name);
  if (!match) {
    return undefined;
  }
  return {
    chainId: Number(match[1]),
    world: address(match[2]),
  };
}

export function parseGameFile(text: string): GameId {
  const raw = JSON.parse(text) as {
    chainId?: unknown;
    world?: unknown;
    season?: unknown;
  };
  // 带季号的旧存档属于已经不用的赛季机制，不再识别。
  if (raw.season !== undefined) {
    throw new Error("这份存档是旧版本的，请选择新的游戏目录");
  }
  if (typeof raw.chainId !== "number" || typeof raw.world !== "string") {
    throw new Error("game.json 缺少链或世界");
  }
  return {
    chainId: raw.chainId,
    world: address(raw.world),
  };
}

// 链上当前这一局：链 ID 和 World 地址。
export type LiveGame = {
  chainId: number;
  world: string;
};

// 存档的链和 World 必须和链上当前这一局一致，否则就是别的局。
export function decideGameStatus(
  file: GameId,
  live: LiveGame,
): "current" | "ended" {
  const isSameGame =
    file.chainId === live.chainId && file.world === live.world.toLowerCase();
  return isSameGame ? "current" : "ended";
}

export const endedGameNotice = {
  title: "游戏已经结束",
  detail: "这份存档不属于链上当前这一局。请让 agent 在当前游戏里重新加入。",
} as const;

// 家写进目录时，这只钱包已经在当时的链上出过生。新一局里出生星会回到 0。
export function playedSaveBelongsToChain(
  hasHome: boolean,
  spawnPlanet: bigint,
): boolean {
  if (!hasHome) {
    return true;
  }
  return spawnPlanet !== 0n;
}

export function serializeGameFile(game: GameId): string {
  return JSON.stringify({
    chainId: game.chainId,
    world: address(game.world),
  });
}

export function chunkPath(
  chunk: Pick<PersistedChunk, "x" | "y" | "s">,
): string {
  return `knownBoard/${chunk.x}_${chunk.y}_${chunk.s}.json`;
}

export function serializeGameSave(save: GameSaveFiles): Map<string, string> {
  const files = new Map<string, string>();
  files.set(
    "agent.json",
    JSON.stringify({ address: address(save.agent.address) }),
  );
  files.set("homeLocations.json", JSON.stringify(save.homeLocations));
  for (const chunk of save.chunks) {
    files.set(chunkPath(chunk), JSON.stringify(chunk));
  }
  for (const tx of save.pendingTxs) {
    files.set(`unminedEthTxs/${tx.hash}.json`, JSON.stringify(tx));
  }
  return files;
}

export function parseGameSave(files: Map<string, string>): GameSaveFiles {
  const agentText = files.get("agent.json");
  if (!agentText) {
    throw new Error("agent.json missing");
  }
  const agent = JSON.parse(agentText) as AgentFile;
  const homesText = files.get("homeLocations.json");
  const homeLocations = homesText
    ? (JSON.parse(homesText) as SaveHomeLocation[])
    : [];
  const chunks: PersistedChunk[] = [];
  const pendingTxs: PendingTxFile[] = [];
  for (const [path, body] of files) {
    if (path.startsWith("knownBoard/") && path.endsWith(".json")) {
      chunks.push(JSON.parse(body) as PersistedChunk);
    }
    if (path.startsWith("unminedEthTxs/") && path.endsWith(".json")) {
      pendingTxs.push(JSON.parse(body) as PendingTxFile);
    }
  }
  return {
    agent: { address: address(agent.address) },
    chunks,
    homeLocations,
    pendingTxs,
  };
}

export function appendChunk(
  files: Map<string, string>,
  chunk: PersistedChunk,
): Map<string, string> {
  const next = new Map(files);
  next.set(chunkPath(chunk), JSON.stringify(chunk));
  return next;
}

export function parseJsonLines(text: string): unknown[] {
  const rows: unknown[] = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") {
      continue;
    }
    try {
      rows.push(JSON.parse(line));
    } catch {
      // 最后一行可能还没写完。
    }
  }
  return rows;
}
