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

function readWorldFromContracts(): {
  address: `0x${string}`;
  blockNumber: bigint;
} {
  const chainId = String(process.env.WORLD_CHAIN_ID ?? "31337");
  const entry = (worldsJson as Record<string, WorldEntry | undefined>)[chainId];
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
 * World 地址默认与 client 一致：来自 packages/contracts/worlds.json（按 WORLD_CHAIN_ID，默认 31337）。
 * 仅在需要覆盖部署目录外的地址时，再在 .env 中设置 WORLD_ADDRESS。
 */
function resolveWorld(): {
  address: `0x${string}`;
  initialBlockNumber: bigint;
} {
  const raw = process.env.WORLD_ADDRESS?.trim();
  const useEnv =
    !!raw && raw.toLowerCase() !== ZERO_ADDR.toLowerCase() && raw.length >= 42;

  if (useEnv) {
    return {
      address: raw as `0x${string}`,
      initialBlockNumber: BigInt(process.env.INITIAL_BLOCK_NUMBER ?? "0"),
    };
  }

  const fromFile = readWorldFromContracts();
  const initialFromEnv = process.env.INITIAL_BLOCK_NUMBER;
  const initialBlockNumber =
    fromFile.blockNumber > 0n
      ? fromFile.blockNumber
      : BigInt(initialFromEnv ?? "0");

  return { address: fromFile.address, initialBlockNumber };
}

const world = resolveWorld();

export const config = {
  port: Number(process.env.PORT ?? 4100),
  rpcUrl: required("RPC_URL"),
  worldAddress: world.address,
  initialBlockNumber: world.initialBlockNumber,
  indexerUrl: process.env.INDEXER_URL,
  databaseUrl: required("DATABASE_URL"),
};
