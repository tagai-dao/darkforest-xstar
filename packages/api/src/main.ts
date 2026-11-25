import { loadServerConfig } from "./config";
import { LeaderboardDb } from "./db";
import { LeaderboardServer } from "./server";

/** 只读排行榜 HTTP：数据由 indexer 侧投影写入 MySQL。 */
const main = async () => {
  const config = loadServerConfig();
  const db = new LeaderboardDb(config.databaseUrl);
  await db.init();

  const server = new LeaderboardServer(db);
  await server.listen(config.port);

  console.log(`[api] read-only leaderboard on :${config.port}`);
};

main().catch((error) => {
  console.error("[api] fatal:", error);
  process.exit(1);
});
