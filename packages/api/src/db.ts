import { isDeepStrictEqual } from "node:util";

import mysql, { type Pool, type PoolConnection } from "mysql2/promise";

import type {
  LeaderboardMode,
  LeaderboardRow,
  LeaderboardSnapshot,
  PlayerRankResponse,
} from "./types";

interface AddressRow extends mysql.RowDataPacket {
  address: string;
}

const batchSize = 500;

type LeaderboardTable =
  | "df_players"
  | "df_player_scores"
  | "df_player_kill_stats";

async function syncTable<Value>(
  connection: PoolConnection,
  table: LeaderboardTable,
  records: ReadonlyMap<string, Value>,
  previous: ReadonlyMap<string, Value> | undefined,
  upsertSql: string,
  toRow: (address: string, value: Value) => string[],
): Promise<void> {
  const changed = [...records]
    .filter(
      ([address, value]) => !isDeepStrictEqual(value, previous?.get(address)),
    )
    .map(([address, value]) => toRow(address, value));
  for (let i = 0; i < changed.length; i += batchSize) {
    await connection.query(upsertSql, [changed.slice(i, i + batchSize)]);
  }

  const existing = previous
    ? [...previous.keys()]
    : (
        await connection.query<AddressRow[]>(`SELECT address FROM ${table}`)
      )[0].map(({ address }) => address);
  const removed = existing.filter((address) => !records.has(address));
  for (let i = 0; i < removed.length; i += batchSize) {
    await connection.query(`DELETE FROM ${table} WHERE address IN (?)`, [
      removed.slice(i, i + batchSize),
    ]);
  }
}

export class LeaderboardDb {
  private readonly pool: Pool;

  public constructor(databaseUrl: string) {
    this.pool = mysql.createPool(databaseUrl);
  }

  public async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS df_indexer_state (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        chain_id BIGINT NOT NULL,
        world_address VARCHAR(42) NOT NULL,
        last_block BIGINT UNSIGNED NOT NULL DEFAULT 0,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_chain_world (chain_id, world_address)
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS df_players (
        address VARCHAR(42) PRIMARY KEY,
        name VARCHAR(128) NULL,
        burner VARCHAR(42) NULL,
        created_at BIGINT UNSIGNED NULL,
        updated_at_block BIGINT UNSIGNED NOT NULL DEFAULT 0,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // MySQL DECIMAL 精度上限为 65；链上 uint256 最多约 78 位十进制，此处用 65 足以覆盖常见游戏数值。
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS df_player_scores (
        address VARCHAR(42) PRIMARY KEY,
        score DECIMAL(65,0) NOT NULL DEFAULT 0,
        updated_at_block BIGINT UNSIGNED NOT NULL DEFAULT 0,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_df_player_scores_players FOREIGN KEY (address) REFERENCES df_players(address) ON DELETE CASCADE
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS df_player_kill_stats (
        address VARCHAR(42) PRIMARY KEY,
        population_destroyed DECIMAL(65,0) NOT NULL DEFAULT 0,
        updated_at_block BIGINT UNSIGNED NOT NULL DEFAULT 0,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_df_player_kill_stats_players FOREIGN KEY (address) REFERENCES df_players(address) ON DELETE CASCADE
      )
    `);
  }

  public async applyLeaderboardSnapshot(
    { chainId, worldAddress }: { chainId: number; worldAddress: string },
    snapshot: LeaderboardSnapshot,
    previous?: LeaderboardSnapshot,
  ) {
    const connection = await this.pool.getConnection();
    const scope = [chainId, worldAddress.toLowerCase()];
    try {
      await connection.beginTransaction();
      await connection.query(
        `INSERT INTO df_indexer_state (chain_id, world_address) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE id = id`,
        scope,
      );
      const [[state]] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT CAST(last_block AS CHAR) AS last_block FROM df_indexer_state
         WHERE chain_id = ? AND world_address = ? FOR UPDATE`,
        scope,
      );
      const lastBlock = BigInt(state.last_block);
      if (lastBlock >= snapshot.blockNumber) {
        await connection.commit();
        return lastBlock === snapshot.blockNumber;
      }

      // In-memory diffs are valid only against the last committed snapshot.
      const baseline =
        previous?.blockNumber === lastBlock ? previous : undefined;
      const block = snapshot.blockNumber.toString();
      await syncTable(
        connection,
        "df_players",
        snapshot.players,
        baseline?.players,
        `INSERT INTO df_players (address, name, burner, created_at, updated_at_block)
         VALUES ? ON DUPLICATE KEY UPDATE name = VALUES(name), burner = VALUES(burner),
         created_at = VALUES(created_at), updated_at_block = VALUES(updated_at_block)`,
        (address, player) => [
          address,
          player.name,
          player.burner,
          player.createdAt.toString(),
          block,
        ],
      );
      await syncTable(
        connection,
        "df_player_scores",
        snapshot.scores,
        baseline?.scores,
        `INSERT INTO df_player_scores (address, score, updated_at_block)
         VALUES ? ON DUPLICATE KEY UPDATE score = VALUES(score),
         updated_at_block = VALUES(updated_at_block)`,
        (address, score) => [address, score.toString(), block],
      );
      await syncTable(
        connection,
        "df_player_kill_stats",
        snapshot.kills,
        baseline?.kills,
        `INSERT INTO df_player_kill_stats (address, population_destroyed, updated_at_block)
         VALUES ? ON DUPLICATE KEY UPDATE population_destroyed = VALUES(population_destroyed),
         updated_at_block = VALUES(updated_at_block)`,
        (address, kills) => [address, kills.toString(), block],
      );
      await connection.query(
        "UPDATE df_indexer_state SET last_block = ? WHERE chain_id = ? AND world_address = ?",
        [block, ...scope],
      );
      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
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
      FROM df_players p
      LEFT JOIN df_player_scores s ON s.address = p.address
      LEFT JOIN df_player_kill_stats k ON k.address = p.address
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
      FROM df_players p
      LEFT JOIN df_player_scores s ON s.address = p.address
      LEFT JOIN df_player_kill_stats k ON k.address = p.address
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
        SELECT COALESCE(score, 0) AS metric FROM df_player_scores
      ) ranked
      WHERE ranked.metric > ?
    `,
      [score],
    );

    const [[killsRankRow]] = await this.pool.query<mysql.RowDataPacket[]>(
      `
      SELECT COUNT(*) + 1 AS rank
      FROM (
        SELECT COALESCE(population_destroyed, 0) AS metric FROM df_player_kill_stats
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

  /**
   * 管理员手动清榜：删掉本库排行榜行，并把该 World 的同步水位清零。
   * 假定一库一局（见 indexer README）；不经过确认门闩，由 CLI 负责确认。
   */
  public async resetLeaderboard(scope: {
    chainId: number;
    worldAddress: string;
  }) {
    const connection = await this.pool.getConnection();
    const world = scope.worldAddress.toLowerCase();
    try {
      await connection.beginTransaction();
      // 子表有 FK；先清子表再清 players，再清水位。
      await connection.query("DELETE FROM df_player_kill_stats");
      await connection.query("DELETE FROM df_player_scores");
      await connection.query("DELETE FROM df_players");
      await connection.query(
        "DELETE FROM df_indexer_state WHERE chain_id = ? AND world_address = ?",
        [scope.chainId, world],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  public async close() {
    await this.pool.end();
  }
}
