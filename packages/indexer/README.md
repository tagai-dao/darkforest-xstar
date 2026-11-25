# BSC store-indexer + 排行榜投影

Client 首屏慢是因为没有 MUD HTTP Indexer，浏览器在用 BSC RPC 从 World 部署块扫日志。

本目录用官方 `@latticexyz/store-indexer` 的 **sqlite-indexer** 追块。

`sqlite-indexer` 负责服务端的链上读取。投影从索引读取 `Player` / `PlayerScore` / `PlayerKillStats`，写入 MySQL。排行榜 HTTP API 只读 MySQL。

## 1. 启动 store-indexer

```bash
cd packages/indexer
cp .env.example .env
# 按需改 RPC / PORT
chmod +x start.sh start-project.sh
./start.sh
```

首次会从 `START_BLOCK` 追到链头。追平后日志会稳定轮询。

同步状态可通过 `curl -i http://127.0.0.1:3001/readyz` 检查，端口与 `.env` 中的 `PORT` 一致。

## 2. 启动排行榜投影（写 MySQL）

store-indexer 起来之后：

```bash
# .env 里配好 DATABASE_URL
./start-project.sh
```

投影等待索引首次追平，然后每两秒从 `INDEXER_URL` 读取一次指定链和 World 的三表快照。每次 MySQL 事务同时更新变化的数据和同步区块。索引暂时不可用时，投影保留最后一次成功写入的数据并重试。

投影使用 `/readyz` 和 `/trpc`，默认连接本机 `http://127.0.0.1:$PORT`，也支持通过 `INDEXER_URL` 指定远程 `sqlite-indexer`。旧投影配置中的 `RPC_URL` 可以删除，`RPC_HTTP_URL` 用于启动索引。每个 World 使用独立的排行榜 MySQL 库。

### 手动清榜重刷（默认不做）

indexer 库被清空重追、或 MySQL 水位高于 indexer 当前块时，榜可能停住。需要管理员在交互终端确认后清榜：

```bash
./reset-project.sh
# 或：cd packages/api && pnpm project:reset
```

终端会打印 chain / World / 目标库，**只有输入 `RESET` 才会删除** `players` / `player_scores` / `player_kill_stats` 以及该 World 的 `indexer_state`，并尝试从 indexer 拉一版新快照。其他输入一律取消。`./start-project.sh` 不会触发重置。

## 3. 启动只读 API

```bash
cd packages/api
# .env 只需 PORT + DATABASE_URL（同一套 MySQL）
pnpm start
```

公网反代：

| 公网                           | 上游                   | 用途            |
| ------------------------------ | ---------------------- | --------------- |
| `darkforest-indexer.tagai.fun` | `127.0.0.1:3101`       | 客户端同步      |
| `sldf-api.tagai.fun`           | `packages/api` 的 PORT | 首页排行榜 HTTP |

## 4. 客户端

`packages/client/.env.production`：

```bash
VITE_INDEXER_URL=https://darkforest-indexer.tagai.fun
VITE_API_BASE_URL=https://sldf-api.tagai.fun
```

## 环境变量要点

| 变量              | 说明                                          |
| ----------------- | --------------------------------------------- |
| `RPC_HTTP_URL`    | BSC HTTP RPC（建议稳定节点）                  |
| `START_BLOCK`     | `worlds.json` 里 56 的 `blockNumber`          |
| `STORE_ADDRESS`   | World 地址                                    |
| `MAX_BLOCK_RANGE` | 默认示例 `500`；过大易被 RPC `limit exceeded` |
| `PORT`            | store-indexer HTTP，默认 `3001`               |
| `DATABASE_URL`    | 投影 + 只读 API 共用的 MySQL                  |
