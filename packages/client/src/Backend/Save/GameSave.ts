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

export type GameId = {
  chainId: number;
  world: string;
  season: number;
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
  return `${game.chainId}-${address(game.world)}-${game.season}`;
}

export function walletFolderName(ref: WalletSaveRef): string {
  return `${gameFolderName(ref.game)}/${address(ref.wallet)}`;
}

export function parseGameFolderName(name: string): GameId | undefined {
  const match = /^(\d+)-(0x[0-9a-fA-F]{40})-(\d+)$/.exec(name);
  if (!match) {
    return undefined;
  }
  return {
    chainId: Number(match[1]),
    world: address(match[2]),
    season: Number(match[3]),
  };
}

export function parseGameFile(text: string): GameId {
  const raw = JSON.parse(text) as {
    chainId?: unknown;
    world?: unknown;
    season?: unknown;
  };
  if (
    typeof raw.chainId !== "number" ||
    typeof raw.world !== "string" ||
    typeof raw.season !== "number"
  ) {
    throw new Error("game.json 缺少链、世界或赛季");
  }
  return {
    chainId: raw.chainId,
    world: address(raw.world),
    season: raw.season,
  };
}

export type LiveSeason = {
  chainId: number;
  open: boolean;
  world: string;
  season: number;
};

// 文件里的局必须和链上正在开放的那一局是同一个。季号更大说明还没轮到，其余对不上都算已经结束。
export function decideGameStatus(
  file: GameId,
  live: LiveSeason,
): "current" | "not-started" | "ended" {
  const liveWorld = live.world.toLowerCase();
  const notOpened =
    !live.open ||
    live.season === 0 ||
    liveWorld === "0x0000000000000000000000000000000000000000";
  if (notOpened) {
    return "not-started";
  }
  if (
    file.chainId === live.chainId &&
    file.world === liveWorld &&
    file.season === live.season
  ) {
    return "current";
  }
  if (file.world === liveWorld && file.season > live.season) {
    return "not-started";
  }
  return "ended";
}

export function serializeGameFile(game: GameId): string {
  return JSON.stringify({
    chainId: game.chainId,
    world: address(game.world),
    season: game.season,
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
