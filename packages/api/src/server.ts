import { createServer } from "node:http";

import express from "express";
import { WebSocketServer } from "ws";

import type { LeaderboardDb } from "./db";
import type { LeaderboardMode } from "./types";

export class LeaderboardServer {
  private readonly app = express();
  private readonly httpServer = createServer(this.app);
  private readonly wsServer = new WebSocketServer({ noServer: true });
  private readonly db: LeaderboardDb;

  public constructor(db: LeaderboardDb) {
    this.db = db;
  }

  public setupRoutes() {
    // 前端（如 Vite :3000）与 API（:4100）不同源时，浏览器会校验 CORS；本 API 无 cookie 鉴权，开发环境用 * 即可。
    this.app.use((_req, res, next) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        (_req.headers["access-control-request-headers"] as
          | string
          | undefined) ?? "Content-Type",
      );
      if (_req.method === "OPTIONS") {
        res.sendStatus(204);
        return;
      }
      next();
    });

    this.app.get("/health", (_request, response) => {
      response.json({ ok: true });
    });

    const leaderboardHandler = async (
      request: express.Request,
      response: express.Response,
    ) => {
      const mode = request.params.mode as LeaderboardMode;
      if (mode !== "score" && mode !== "kills") {
        response.status(400).json({ error: "Invalid leaderboard mode" });
        return;
      }

      const limit = Number(request.query.limit ?? 100);
      const offset = Number(request.query.offset ?? 0);

      const rows = await this.db.getLeaderboard(mode, limit, offset);
      response.json({ mode, rows, limit, offset });
    };

    const playerRankHandler = async (
      request: express.Request,
      response: express.Response,
    ) => {
      const rank = await this.db.getPlayerRank(request.params.address);
      if (!rank) {
        response.status(404).json({ error: "Player not found" });
        return;
      }
      response.json(rank);
    };

    // New generic API prefix
    this.app.get("/api/leaderboard/:mode", leaderboardHandler);
    this.app.get("/api/players/:address/rank", playerRankHandler);

    // Backward compatibility for existing frontend or scripts
    this.app.get("/leaderboard/:mode", leaderboardHandler);
    this.app.get("/players/:address/rank", playerRankHandler);

    this.httpServer.on("upgrade", (request, socket, head) => {
      const url = request.url ?? "";
      if (
        !url.startsWith("/api/leaderboard") &&
        !url.startsWith("/leaderboard")
      ) {
        socket.destroy();
        return;
      }
      this.wsServer.handleUpgrade(request, socket, head, (ws) => {
        this.wsServer.emit("connection", ws, request);
      });
    });

    this.wsServer.on("connection", (ws) => {
      ws.send(JSON.stringify({ type: "connected" }));
    });
  }

  public async broadcastLeaderboardUpdate() {
    const [scoreRows, killRows] = await Promise.all([
      this.db.getLeaderboard("score", 50, 0),
      this.db.getLeaderboard("kills", 50, 0),
    ]);

    const payload = JSON.stringify({
      type: "leaderboard_update",
      scoreRows,
      killRows,
      updatedAt: Date.now(),
    });

    for (const client of this.wsServer.clients) {
      if (client.readyState === client.OPEN) {
        client.send(payload);
      }
    }
  }

  public async listen(port: number) {
    this.setupRoutes();
    await new Promise<void>((resolve) => {
      this.httpServer.listen(port, () => resolve());
    });
  }
}
