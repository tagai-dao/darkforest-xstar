import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { loadProjectConfig } from "./config";
import { LeaderboardDb } from "./db";
import { LeaderboardProjector } from "./projector";

/** 把 DATABASE_URL 里的密码打码，方便管理员核对目标库。 */
function maskDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = "***";
    return parsed.toString();
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

/**
 * 手动清榜并重刷：默认什么都不做，必须在交互终端输入 RESET。
 * 常驻 `pnpm project` 不会走这条路径。
 */
const main = async () => {
  const config = loadProjectConfig();

  console.log("[project:reset] 将删除本库排行榜数据并清零同步水位：");
  console.log(`  chainId        = ${config.chainId}`);
  console.log(`  worldAddress   = ${config.worldAddress}`);
  console.log(`  indexerUrl     = ${config.indexerUrl}`);
  console.log(`  databaseUrl    = ${maskDatabaseUrl(config.databaseUrl)}`);
  console.log("");
  console.log("此操作不可自动撤销。确认请输入 RESET（其他任何输入都会取消）。");

  if (!input.isTTY || !output.isTTY) {
    throw new Error(
      "project:reset 需要交互式终端确认。默认不重置；请在 SSH/本机 TTY 下运行。",
    );
  }

  const rl = createInterface({ input, output });
  let answer: string;
  try {
    answer = (await rl.question("> ")).trim();
  } finally {
    rl.close();
  }

  if (answer !== "RESET") {
    console.log("[project:reset] 已取消，未改动数据库。");
    return;
  }

  const db = new LeaderboardDb(config.databaseUrl);
  try {
    await db.init();
    await db.resetLeaderboard(config);
    console.log("[project:reset] 榜单与水位已清空。");

    // 立刻从 indexer 拉一版；失败也不回滚清空（管理员可再开 project 重试）。
    const projector = new LeaderboardProjector(db, config);
    await projector.syncOnce();
    console.log("[project:reset] 已尝试从 indexer 重刷一版快照。");
  } finally {
    await db.close();
  }
};

main().catch((error) => {
  console.error("[project:reset] fatal:", error);
  process.exit(1);
});
