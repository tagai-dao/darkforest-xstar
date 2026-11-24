# BSC store-indexer

Client 首屏慢是因为没有 MUD HTTP Indexer，浏览器在用 BSC RPC 从 World 部署块扫日志。

本目录用官方 `@latticexyz/store-indexer` 的 **sqlite-indexer**。  
排行榜 API（`sldf-api` + MySQL）是另一回事，不能当 `VITE_INDEXER_URL`。

## 1. 服务器上启动

```bash
cd packages/indexer
cp .env.example .env
# 按需改 RPC / PORT
chmod +x start.sh
./start.sh
```

首次会从 `START_BLOCK` 追到链头，可能要一段时间。追平后日志会稳定轮询。

健康检查：本机 `curl -sI http://127.0.0.1:3001`（进程起来即监听；追块未完成时客户端仍可能偏慢）。

## 2. 反代到公网 HTTPS

例如 Nginx / Caddy：

- 公网：`https://darkforest-indexer.tagai.fun`
- 上游：`http://127.0.0.1:3101`

CORS：indexer 自带 cors；若前面还有网关，允许 `https://starlinkdf.tagai.fun`。

## 3. 改客户端并重发

`packages/client/.env.production`：

```bash
VITE_INDEXER_URL=https://darkforest-indexer.tagai.fun
```

然后：

```bash
cd packages/client
pnpm deploy:cf
```

## 环境变量要点

| 变量              | 说明                                             |
| ----------------- | ------------------------------------------------ |
| `RPC_HTTP_URL`    | BSC HTTP RPC（建议稳定节点，公共 seed 可能限流） |
| `START_BLOCK`     | `worlds.json` 里 56 的 `blockNumber`             |
| `STORE_ADDRESS`   | World 地址                                       |
| `MAX_BLOCK_RANGE` | 默认示例 `500`；过大易被 RPC `limit exceeded`    |
| `PORT`            | HTTP API，默认 `3001`                            |

MySQL 继续只给 `packages/api` 排行榜用；indexer 用本地 sqlite 文件即可。
