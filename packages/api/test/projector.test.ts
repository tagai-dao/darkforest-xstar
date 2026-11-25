import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";

import { LeaderboardProjector } from "../src/projector";
import type { LeaderboardSnapshot } from "../src/types";

const world = "0x1111111111111111111111111111111111111111";
const player = "0x2222222222222222222222222222222222222222";
const secondPlayer = "0x3333333333333333333333333333333333333333";
const tableIds = [
  "0x74626466000000000000000000000000506c6179657200000000000000000000",
  "0x74626466000000000000000000000000506c6179657253636f72650000000000",
  "0x74626466000000000000000000000000506c617965724b696c6c537461747300",
];

void test("projects one World snapshot over HTTP and retries incomplete writes", async (t) => {
  let ready = false;
  let includeKills = true;
  let block = 150n;
  let failWrite = true;
  const requests: { path: string; input: unknown }[] = [];
  const writes: { snapshot: LeaderboardSnapshot; previous?: bigint }[] = [];

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === "/readyz") {
      response.writeHead(ready ? 200 : 503).end();
      return;
    }

    const input = url.searchParams.get("input");
    requests.push({ path: url.pathname, input: input && JSON.parse(input) });
    const tables = [
      [{ owner: player, name: "Alice", burner: player, createdAt: "123" }],
      [{ player, score: "900719925474099999" }],
      [{ player: secondPlayer, populationDestroyed: "42" }],
    ]
      .slice(0, includeKills ? 3 : 2)
      .map((fields, index) => ({
        address: world,
        tableId: tableIds[index],
        records: fields.map((entry) => ({ fields: entry })),
      }));
    const values = {
      blockNumber: ["bigint"],
      "tables.0.records.0.fields.createdAt": ["bigint"],
      "tables.1.records.0.fields.score": ["bigint"],
      ...(includeKills && {
        "tables.2.records.0.fields.populationDestroyed": ["bigint"],
      }),
    };
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify([
        {
          result: {
            data: {
              json: { blockNumber: String(block), tables },
              meta: { values },
            },
          },
        },
      ]),
    );
  });
  server.listen(0, "127.0.0.1");
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  await once(server, "listening");
  const endpoint = server.address();
  assert(endpoint && typeof endpoint !== "string");

  const projector = new LeaderboardProjector(
    {
      applyLeaderboardSnapshot(scope, snapshot, previous) {
        assert.equal(scope.chainId, 56);
        assert.equal(scope.worldAddress, world);
        if (failWrite) return Promise.reject(new Error("database unavailable"));
        writes.push({ snapshot, previous: previous?.blockNumber });
        return Promise.resolve(true);
      },
    },
    {
      chainId: 56,
      worldAddress: world,
      initialBlockNumber: 100n,
      indexerUrl: `http://127.0.0.1:${endpoint.port}`,
      databaseUrl: "unused",
    },
  );

  await projector.syncOnce();
  assert.equal(requests.length, 0);
  ready = true;
  await assert.rejects(projector.syncOnce(), /database unavailable/);
  failWrite = false;
  await projector.syncOnce();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].snapshot.blockNumber, 150n);
  assert.equal(writes[0].previous, undefined);
  assert.equal(writes[0].snapshot.players.get(player)?.name, "Alice");
  assert.equal(writes[0].snapshot.players.get(secondPlayer)?.name, "");
  assert.equal(writes[0].snapshot.scores.get(player), 900719925474099999n);
  assert.equal(writes[0].snapshot.kills.get(secondPlayer), 42n);

  await projector.syncOnce();
  assert.equal(writes.length, 1);
  block = 149n;
  await projector.syncOnce();
  assert.equal(writes.length, 1);

  block = 151n;
  includeKills = false;
  await assert.rejects(
    projector.syncOnce(),
    /Missing or mismatched leaderboard table/,
  );
  assert.equal(writes.length, 1);
  includeKills = true;
  await projector.syncOnce();
  assert.equal(writes.length, 2);
  assert.equal(writes[1].snapshot.blockNumber, 151n);
  assert.equal(writes[1].previous, 150n);

  for (const request of requests) {
    assert.equal(request.path, "/trpc/findAll");
    assert.deepEqual(request.input, {
      0: {
        json: {
          chainId: 56,
          address: world,
          filters: tableIds.map((tableId) => ({ tableId })),
        },
      },
    });
  }
});
