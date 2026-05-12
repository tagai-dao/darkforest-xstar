import mysql, { type Pool } from "mysql2/promise";

import type {
  LeaderboardMode,
  LeaderboardRow,
  PlayerRankResponse,
} from "./types";

export class LeaderboardDb {
  private readonly pool: Pool;

  public constructor(databaseUrl: string) {
    this.pool = mysql.createPool(databaseUrl);
  }

  public async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS indexer_state (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        chain_id BIGINT NOT NULL,
        world_address VARCHAR(42) NOT NULL,
        last_block BIGINT UNSIGNED NOT NULL DEFAULT 0,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_chain_world (chain_id, world_address)
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS players (
        address VARCHAR(42) PRIMARY KEY,
        name VARCHAR(128) NULL,
        burner VARCHAR(42) NULL,
        created_at BIGINT UNSIGNED NULL,
        updated_at_block BIGINT UNSIGNED NOT NULL DEFAULT 0,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS player_scores (
        address VARCHAR(42) PRIMARY KEY,
        score DECIMAL(78,0) NOT NULL DEFAULT 0,
        updated_at_block BIGINT UNSIGNED NOT NULL DEFAULT 0,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_player_scores_players FOREIGN KEY (address) REFERENCES players(address) ON DELETE CASCADE
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS player_kill_stats (
        address VARCHAR(42) PRIMARY KEY,
        population_destroyed DECIMAL(78,0) NOT NULL DEFAULT 0,
        updated_at_block BIGINT UNSIGNED NOT NULL DEFAULT 0,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_player_kill_stats_players FOREIGN KEY (address) REFERENCES players(address) ON DELETE CASCADE
      )
    `);
  }

  public async upsertPlayer(input: {
    address: string;
    name: string;
    burner: string;
    createdAt: bigint;
    blockNumber: bigint;
  }) {
    await this.pool.query(
      `
      INSERT INTO players (address, name, burner, created_at, updated_at_block)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        burner = VALUES(burner),
        created_at = VALUES(created_at),
        updated_at_block = GREATEST(updated_at_block, VALUES(updated_at_block))
    `,
      [
        input.address.toLowerCase(),
        input.name,
        input.burner.toLowerCase(),
        input.createdAt.toString(),
        input.blockNumber.toString(),
      ],
    );
  }

  public async upsertScore(input: {
    address: string;
    score: bigint;
    blockNumber: bigint;
  }) {
    await this.pool.query(
      `
      INSERT INTO player_scores (address, score, updated_at_block)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        score = VALUES(score),
        updated_at_block = GREATEST(updated_at_block, VALUES(updated_at_block))
    `,
      [
        input.address.toLowerCase(),
        input.score.toString(),
        input.blockNumber.toString(),
      ],
    );
  }

  public async upsertKills(input: {
    address: string;
    kills: bigint;
    blockNumber: bigint;
  }) {
    await this.pool.query(
      `
      INSERT INTO player_kill_stats (address, population_destroyed, updated_at_block)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        population_destroyed = VALUES(population_destroyed),
        updated_at_block = GREATEST(updated_at_block, VALUES(updated_at_block))
    `,
      [
        input.address.toLowerCase(),
        input.kills.toString(),
        input.blockNumber.toString(),
      ],
    );
  }

  public async getLeaderboard(
    mode: LeaderboardMode,
    limit: number,
    offset: number,
  ) {
    const orderColumn =
      mode === "score"
        ? "COALESCE(s.score, 0)"
        : "COALESCE(k.population_destroyed, 0)";

    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
      `
      SELECT
        p.address AS address,
        p.name AS name,
        COALESCE(s.score, 0) AS score,
        COALESCE(k.population_destroyed, 0) AS kills
      FROM players p
      LEFT JOIN player_scores s ON s.address = p.address
      LEFT JOIN player_kill_stats k ON k.address = p.address
      ORDER BY ${orderColumn} DESC, p.address ASC
      LIMIT ? OFFSET ?
    `,
      [limit, offset],
    );

    return rows.map<LeaderboardRow>((row, index) => ({
      address: String(row.address),
      name: row.name ? String(row.name) : null,
      score: String(row.score),
      kills: String(row.kills),
      rank: offset + index + 1,
    }));
  }

  public async getPlayerRank(
    address: string,
  ): Promise<PlayerRankResponse | null> {
    const normalized = address.toLowerCase();
    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
      `
      SELECT
        p.address AS address,
        COALESCE(s.score, 0) AS score,
        COALESCE(k.population_destroyed, 0) AS kills
      FROM players p
      LEFT JOIN player_scores s ON s.address = p.address
      LEFT JOIN player_kill_stats k ON k.address = p.address
      WHERE p.address = ?
      LIMIT 1
    `,
      [normalized],
    );

    if (rows.length === 0) {
      return null;
    }

    const score = String(rows[0].score);
    const kills = String(rows[0].kills);

    const [[scoreRankRow]] = await this.pool.query<mysql.RowDataPacket[]>(
      `
      SELECT COUNT(*) + 1 AS rank
      FROM (
        SELECT COALESCE(score, 0) AS metric FROM player_scores
      ) ranked
      WHERE ranked.metric > ?
    `,
      [score],
    );

    const [[killsRankRow]] = await this.pool.query<mysql.RowDataPacket[]>(
      `
      SELECT COUNT(*) + 1 AS rank
      FROM (
        SELECT COALESCE(population_destroyed, 0) AS metric FROM player_kill_stats
      ) ranked
      WHERE ranked.metric > ?
    `,
      [kills],
    );

    return {
      address: normalized,
      score,
      kills,
      scoreRank: Number(scoreRankRow.rank),
      killsRank: Number(killsRankRow.rank),
    };
  }
}
