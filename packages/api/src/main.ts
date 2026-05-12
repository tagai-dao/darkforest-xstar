import { config } from "./config";
import { LeaderboardDb } from "./db";
import { LeaderboardIndexer } from "./indexer";
import { LeaderboardServer } from "./server";

const main = async () => {
  const db = new LeaderboardDb(config.databaseUrl);
  await db.init();

  const server = new LeaderboardServer(db);
  await server.listen(config.port);

  const indexer = new LeaderboardIndexer(db, config, async () => {
    await server.broadcastLeaderboardUpdate();
  });
  await indexer.start();

  console.log(`[api] running on :${config.port}`);
};

main().catch((error) => {
  console.error("[api] fatal:", error);
  process.exit(1);
});
