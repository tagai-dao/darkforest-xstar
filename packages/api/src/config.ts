import "dotenv/config";

import worldsJson from "../../contracts/worlds.json";

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

const required = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
};

type WorldEntry = { address?: string; blockNumber?: number };

function readWorldFromContracts(chainId: number): {
  address: `0x${string}`;
  blockNumber: bigint;
} {
  const entry = (worldsJson as Record<number, WorldEntry | undefined>)[chainId];
  if (!entry?.address) {
    throw new Error(
      `contracts/worlds.json 中没有链 ${chainId} 的 World 地址。请先部署合约（mud deploy），或在 .env 中设置 WORLD_ADDRESS 覆盖。`,
    );
  }
  const block =
    entry.blockNumber !== undefined && entry.blockNumber !== null
      ? BigInt(entry.blockNumber)
      : 0n;
  return { address: entry.address as `0x${string}`, blockNumber: block };
}

/**
 * World 地址默认与 client 一致：来自 packages/contracts/worlds.json（按 WORLD_CHAIN_ID）。
 * 仅在需要覆盖时再设 WORLD_ADDRESS。
 */
function resolveWorld(chainId: number): {
  address: `0x${string}`;
  initialBlockNumber: bigint;
} {
  const raw = process.env.WORLD_ADDRESS?.trim();
  if (raw && raw !== ZERO_ADDR) {
    if (!/^0x[\da-f]{40}$/i.test(raw)) {
      throw new Error("WORLD_ADDRESS must be a 20-byte hex address");
    }
    return {
      address: raw.toLowerCase() as `0x${string}`,
      initialBlockNumber: BigInt(process.env.INITIAL_BLOCK_NUMBER ?? "0"),
    };
  }

  const fromFile = readWorldFromContracts(chainId);
  const initialFromEnv = process.env.INITIAL_BLOCK_NUMBER;
  const initialBlockNumber =
    fromFile.blockNumber > 0n
      ? fromFile.blockNumber
      : BigInt(initialFromEnv ?? "0");

  return { address: fromFile.address, initialBlockNumber };
}

/** 只读 API：不碰 RPC，只读 MySQL。 */
export function loadServerConfig() {
  return {
    port: Number(process.env.PORT ?? 4100),
    databaseUrl: required("DATABASE_URL"),
  };
}

/** 排行榜投影：从 MUD store-indexer 的 HTTP 快照读表，写入 MySQL。 */
export function loadProjectConfig() {
  const chainId = Number(process.env.WORLD_CHAIN_ID ?? "31337");
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error("WORLD_CHAIN_ID must be a positive integer");
  }
  const world = resolveWorld(chainId);
  const indexerUrl = required("INDEXER_URL").replace(/\/+$/, "");
  return {
    chainId,
    indexerUrl,
    worldAddress: world.address,
    initialBlockNumber: world.initialBlockNumber,
    databaseUrl: required("DATABASE_URL"),
  };
}

export type ProjectConfig = ReturnType<typeof loadProjectConfig>;
export type ServerConfig = ReturnType<typeof loadServerConfig>;
