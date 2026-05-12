import {
  createWorld,
  type Entity,
  getComponentValue,
  Has,
  runQuery,
} from "@latticexyz/recs";
import { syncToRecs } from "@latticexyz/store-sync/recs";
import { createPublicClient, type Hex, http } from "viem";

import mudConfig from "../../contracts/mud.config";
import type { config as configType } from "./config";
import type { LeaderboardDb } from "./db";

type IndexerConfig = typeof configType;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const normalizeAddress = (value: unknown): string => {
  if (typeof value === "string" && value.startsWith("0x")) {
    if (value.length === 42) return value.toLowerCase();
    if (value.length === 66) return `0x${value.slice(-40)}`.toLowerCase();
  }
  return ZERO_ADDRESS;
};

const entityToAddress = (entity: Entity): string => {
  const raw = String(entity);
  if (raw.startsWith("0x") && raw.length === 42) return raw.toLowerCase();
  if (raw.startsWith("0x") && raw.length >= 42)
    return `0x${raw.slice(-40)}`.toLowerCase();
  return ZERO_ADDRESS;
};

type OnLeaderboardUpdated = () => Promise<void> | void;

export class LeaderboardIndexer {
  private readonly db: LeaderboardDb;
  private readonly config: IndexerConfig;
  private readonly onLeaderboardUpdated: OnLeaderboardUpdated;
  private readonly world = createWorld();

  public constructor(
    db: LeaderboardDb,
    config: IndexerConfig,
    onLeaderboardUpdated: OnLeaderboardUpdated,
  ) {
    this.db = db;
    this.config = config;
    this.onLeaderboardUpdated = onLeaderboardUpdated;
  }

  public async start() {
    const publicClient = createPublicClient({
      transport: http(this.config.rpcUrl),
      pollingInterval: 1000,
    });

    const { components, latestBlock$ } = await syncToRecs({
      world: this.world,
      config: mudConfig,
      address: this.config.worldAddress as Hex,
      publicClient,
      indexerUrl: this.config.indexerUrl,
      startBlock: this.config.initialBlockNumber,
    });

    let currentBlock = 0n;
    latestBlock$.subscribe((block) => {
      const maybeNumber = (block as { number?: bigint }).number;
      currentBlock = maybeNumber ?? 0n;
    });

    const syncBlock = (): bigint => currentBlock;

    const upsertPlayerFromEntity = async (entity: Entity) => {
      const player = getComponentValue(components.Player, entity);
      if (!player) return;
      await this.db.upsertPlayer({
        address: entityToAddress(entity),
        name: player.name ?? "",
        burner: normalizeAddress(player.burner),
        createdAt: BigInt(player.createdAt ?? 0),
        blockNumber: syncBlock(),
      });
    };

    const upsertScoreFromEntity = async (entity: Entity) => {
      const score = getComponentValue(components.PlayerScore, entity);
      if (!score) return;
      await this.db.upsertScore({
        address: entityToAddress(entity),
        score: BigInt(score.score ?? 0),
        blockNumber: syncBlock(),
      });
    };

    const upsertKillsFromEntity = async (entity: Entity) => {
      const kills = getComponentValue(components.PlayerKillStats, entity);
      if (!kills) return;
      await this.db.upsertKills({
        address: entityToAddress(entity),
        kills: BigInt(kills.populationDestroyed ?? 0),
        blockNumber: syncBlock(),
      });
    };

    const initialPlayers = [...runQuery([Has(components.Player)])];
    for (const entity of initialPlayers) {
      await upsertPlayerFromEntity(entity);
    }

    const initialScores = [...runQuery([Has(components.PlayerScore)])];
    for (const entity of initialScores) {
      await upsertScoreFromEntity(entity);
    }

    const initialKills = [...runQuery([Has(components.PlayerKillStats)])];
    for (const entity of initialKills) {
      await upsertKillsFromEntity(entity);
    }

    await this.onLeaderboardUpdated();

    components.Player.update$.subscribe(async (update) => {
      const [nextValue] = update.value;
      if (!nextValue) return;
      await upsertPlayerFromEntity(update.entity);
      await this.onLeaderboardUpdated();
    });

    components.PlayerScore.update$.subscribe(async (update) => {
      const [nextValue] = update.value;
      if (!nextValue) return;
      await upsertScoreFromEntity(update.entity);
      await this.onLeaderboardUpdated();
    });

    components.PlayerKillStats.update$.subscribe(async (update) => {
      const [nextValue] = update.value;
      if (!nextValue) return;
      await upsertKillsFromEntity(update.entity);
      await this.onLeaderboardUpdated();
    });
  }
}
