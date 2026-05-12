import "dotenv/config";

const required = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
};

export const config = {
  port: Number(process.env.PORT ?? 4100),
  rpcUrl: required("RPC_URL"),
  worldAddress: required("WORLD_ADDRESS") as `0x${string}`,
  initialBlockNumber: BigInt(process.env.INITIAL_BLOCK_NUMBER ?? "0"),
  indexerUrl: process.env.INDEXER_URL,
  databaseUrl: required("DATABASE_URL"),
};
