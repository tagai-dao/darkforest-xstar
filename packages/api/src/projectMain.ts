import { loadProjectConfig } from "./config";
import { LeaderboardDb } from "./db";
import { LeaderboardProjector } from "./projector";

const main = async () => {
  const config = loadProjectConfig();
  const db = new LeaderboardDb(config.databaseUrl);
  await db.init();

  const projector = new LeaderboardProjector(db, config);
  console.log(
    `[project] writing leaderboard from indexer ${config.indexerUrl} → MySQL`,
  );
  await projector.run();
};

main().catch((error) => {
  console.error("[project] fatal:", error);
  process.exit(1);
});
