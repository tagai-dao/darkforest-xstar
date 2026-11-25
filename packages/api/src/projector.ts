import { setTimeout as delay } from "node:timers/promises";

import { createIndexerClient } from "@latticexyz/store-sync/trpc-indexer";

import type { ProjectConfig } from "./config";
import type { LeaderboardDb } from "./db";
import type { LeaderboardSnapshot } from "./types";

// Resource IDs from the generated df tables in contracts/src/codegen/tables.
const tableIds = {
  player: "0x74626466000000000000000000000000506c6179657200000000000000000000",
  score: "0x74626466000000000000000000000000506c6179657253636f72650000000000",
  kills: "0x74626466000000000000000000000000506c617965724b696c6c537461747300",
} as const;

const filters = Object.values(tableIds).map((tableId) => ({ tableId }));
const emptyPlayer = {
  name: "",
  burner: "0x0000000000000000000000000000000000000000",
  createdAt: 0n,
};

function address(value: unknown): string {
  if (typeof value !== "string" || !/^0x[\da-f]{40}$/i.test(value)) {
    throw new Error("Invalid address in leaderboard snapshot");
  }
  return value.toLowerCase();
}

function uint(value: unknown): bigint {
  if (typeof value !== "bigint" || value < 0n) {
    throw new Error("Invalid unsigned integer in leaderboard snapshot");
  }
  return value;
}

export class LeaderboardProjector {
  private readonly indexer;
  private previous?: LeaderboardSnapshot;

  public constructor(
    private readonly db: Pick<LeaderboardDb, "applyLeaderboardSnapshot">,
    private readonly config: ProjectConfig,
  ) {
    this.indexer = createIndexerClient({ url: `${config.indexerUrl}/trpc` });
  }

  public async syncOnce() {
    const { chainId, worldAddress, initialBlockNumber, indexerUrl } =
      this.config;
    if (!this.previous) {
      // On first run the SQLite indexer may be rebuilding. Wait for its complete state.
      const ready = await fetch(`${indexerUrl}/readyz`, {
        signal: AbortSignal.timeout(10_000),
      });
      await ready.text();
      if (ready.status === 503) return;
      if (!ready.ok)
        throw new Error(`Indexer readiness check returned ${ready.status}`);
    }

    const { blockNumber, tables } = await this.indexer.findAll.query(
      { chainId, address: worldAddress, filters },
      { signal: AbortSignal.timeout(10_000) },
    );
    if (blockNumber === null || uint(blockNumber) < initialBlockNumber) {
      throw new Error(
        `Indexer has no snapshot for chain ${chainId} and World ${worldAddress}`,
      );
    }
    if (this.previous && blockNumber <= this.previous.blockNumber) return;

    const records = (tableId: (typeof tableIds)[keyof typeof tableIds]) => {
      const matches = tables.filter((table) => table.tableId === tableId);
      if (
        matches.length !== 1 ||
        address(matches[0].address) !== worldAddress.toLowerCase()
      ) {
        throw new Error(`Missing or mismatched leaderboard table ${tableId}`);
      }
      return matches[0].records;
    };

    const players = new Map(
      records(tableIds.player).map(({ fields }) => {
        if (typeof fields.name !== "string") {
          throw new Error("Invalid player name in leaderboard snapshot");
        }
        return [
          address(fields.owner),
          {
            name: fields.name,
            burner: address(fields.burner),
            createdAt: uint(fields.createdAt),
          },
        ];
      }),
    );
    const scores = new Map(
      records(tableIds.score).map(({ fields }) => [
        address(fields.player),
        uint(fields.score),
      ]),
    );
    const kills = new Map(
      records(tableIds.kills).map(({ fields }) => [
        address(fields.player),
        uint(fields.populationDestroyed),
      ]),
    );

    for (const player of scores.keys()) {
      if (!players.has(player)) players.set(player, emptyPlayer);
    }
    for (const player of kills.keys()) {
      if (!players.has(player)) players.set(player, emptyPlayer);
    }

    const snapshot = { blockNumber, players, scores, kills };
    const applied = await this.db.applyLeaderboardSnapshot(
      this.config,
      snapshot,
      this.previous,
    );
    if (applied && !this.previous) {
      console.log(
        `[project] snapshot ${blockNumber}: players=${players.size} scores=${scores.size} kills=${kills.size}`,
      );
    }
    if (applied) this.previous = snapshot;
  }

  public async run() {
    for (;;) {
      try {
        await this.syncOnce();
      } catch (error) {
        console.error("[project] sync failed, retrying:", error);
      }
      await delay(2_000);
    }
  }
}
