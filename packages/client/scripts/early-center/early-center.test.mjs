import assert from "node:assert/strict";
import test from "node:test";
import { utils } from "ethers";
import {
  canSendFleet,
  canSendRoute,
  planCenterAdvance,
} from "./early-center-plan.mjs";
import {
  fixedBlockReader,
  readIncomingFleets,
  readMapEvents,
  readRpc,
} from "./early-center.mjs";

const world = "0xfDf868Ea710FfD8cd33b829c5AFf79eDd15EcD5f";
const multicall = "0xcA11bde05977b3631167028862bE2a173976CA11";
const abi = new utils.Interface([
  "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) returns (tuple(bool success, bytes returnData)[])",
  "function readValue(uint256 key) view returns (uint256)",
]);
const call = (key) => ({
  target: world,
  abi,
  method: "readValue",
  data: abi.encodeFunctionData("readValue", [key]),
});

test("snapshot stages and shards send only the intended calls through Multicall3 at one block", async () => {
  const expected = [Array.from({ length: 24 }, (_, i) => i), [24], [25, 26]];
  const read = fixedBlockReader(
    async (method, [tx, block]) => {
      assert.equal(method, "eth_call");
      assert.equal(tx.to, multicall);
      assert.equal(block, "0x123");
      const group = abi.decodeFunctionData("aggregate3", tx.data)[0];
      const keys = expected.shift();
      assert.deepEqual(
        group.map((entry) => [
          entry.target,
          entry.allowFailure,
          entry.callData,
        ]),
        keys.map((key) => [world, false, call(key).data]),
      );
      return abi.encodeFunctionResult("aggregate3", [
        keys.map((key) => [
          true,
          abi.encodeFunctionResult("readValue", [key + 1]),
        ]),
      ]);
    },
    "0x123",
    world,
  );
  assert.equal(
    (
      await read(Array.from({ length: 25 }, (_, i) => call(i)))
    )[24][0].toNumber(),
    25,
  );
  assert.deepEqual(
    (await read([call(25), call(26)])).map(([value]) => value.toNumber()),
    [26, 27],
  );
  assert.equal(expected.length, 0);
});

test("snapshot rejects failed subcalls and unexpected targets without fallback", async () => {
  let count = 0;
  const read = fixedBlockReader(
    async () => {
      count++;
      return abi.encodeFunctionResult("aggregate3", [[[false, "0x"]]]);
    },
    "0x123",
    world,
  );
  await assert.rejects(read([call(0)]), /Incomplete Multicall3/);
  await assert.rejects(
    read([
      { ...call(0), target: "0x0000000000000000000000000000000000000001" },
    ]),
    /Unexpected batch target/,
  );
  assert.equal(count, 1);
  await assert.rejects(readRpc("eth_sendRawTransaction"), /Read-only RPC/);
});

const player = "0x8153c8c8ef6d9e7e7ee11333f33048835325add0";
const neutral = "0x0000000000000000000000000000000000000000";

test("reads wrapped inbound fleet slots via the same fixed-block Multicall", async () => {
  const store = new utils.Interface([
    "function getRecord(bytes32,bytes32[]) view returns(bytes,bytes32,bytes)",
  ]);
  const hash = "10".repeat(32);
  const keys = [utils.hexZeroPad("0x1d", 32), utils.hexZeroPad("0x00", 32)];
  const data = Buffer.alloc(124);
  Buffer.from(player.slice(2), "hex").copy(data, 40);
  data.writeBigUInt64BE(1500n, 76);
  const read = fixedBlockReader(
    async (method, [tx, block]) => {
      assert.equal(method, "eth_call");
      assert.equal(tx.to, multicall);
      assert.equal(block, "0x123");
      const calls = abi.decodeFunctionData("aggregate3", tx.data)[0];
      assert.deepEqual(
        calls.map(({ target, allowFailure, callData }) => [
          target,
          allowFailure,
          callData,
        ]),
        keys.map((slot) => [
          world,
          false,
          store.encodeFunctionData("getRecord", [
            "0x746264660000000000000000000000004d6f7665000000000000000000000000",
            ["0x" + hash, slot],
          ]),
        ]),
      );
      const response = store.encodeFunctionResult("getRecord", [
        "0x" + data.toString("hex"),
        utils.hexZeroPad("0x00", 32),
        "0x",
      ]);
      return abi.encodeFunctionResult("aggregate3", [
        [
          [true, response],
          [true, response],
        ],
      ]);
    },
    "0x123",
    world,
  );
  const [incoming] = await readIncomingFleets(read, world, [
    {
      hash,
      pending: 2,
      queue: { head: 29, indexes: Array.from({ length: 30 }, (_, i) => i) },
    },
  ]);
  assert.deepEqual(incoming, [
    { captain: player, energy: 1500 },
    { captain: player, energy: 1500 },
  ]);
});

test("map discovery tracks acquisitions, losses and published coordinates at the snapshot block", async () => {
  const events = new utils.Interface([
    "event Store_SetRecord(bytes32 indexed tableId, bytes32[] keyTuple, bytes staticData, bytes32 encodedLengths, bytes dynamicData)",
    "event Store_SpliceStaticData(bytes32 indexed tableId, bytes32[] keyTuple, uint48 start, bytes data)",
  ]);
  const ownerTable =
    "0x74626466000000000000000000000000506c616e65744f776e65720000000000";
  const revealTable =
    "0x7462646600000000000000000000000052657665616c6564506c616e65740000";
  const lost = utils.hexZeroPad("0x01", 32);
  const captured = utils.hexZeroPad("0x02", 32);
  const ownership = (hash, owner, blockNumber) => ({
    ...events.encodeEventLog(events.getEvent("Store_SpliceStaticData"), [
      ownerTable,
      [hash],
      0,
      owner,
    ]),
    blockNumber,
    logIndex: "0x0",
  });
  const reveal = {
    ...events.encodeEventLog(events.getEvent("Store_SetRecord"), [
      revealTable,
      [captured],
      utils.solidityPack(["int32", "int32", "address"], [-78973, 5498, player]),
      utils.hexZeroPad("0x00", 32),
      "0x",
    ]),
    blockNumber: "0x12",
    logIndex: "0x1",
  };
  const map = await readMapEvents(
    async (method, [filter]) => {
      assert.equal(method, "eth_getLogs");
      assert.equal(filter.address, world);
      assert.equal(filter.toBlock, "0x15");
      assert.deepEqual(filter.topics[1], [ownerTable, revealTable]);
      return [
        reveal,
        ownership(lost, neutral, "0x14"),
        ownership(lost, player, "0x10"),
        ownership(captured, player, "0x12"),
      ];
    },
    world,
    "0x15",
    player,
  );
  assert.deepEqual([...map.owned], [captured.slice(2)]);
  assert.equal(map.revealed.get(captured.slice(2)).x, -78973);
});

const planet = (x, fields = {}) => ({
  hash: String(x),
  x,
  y: 0,
  radius: x,
  owner: neutral,
  junkOwner: neutral,
  pending: 0,
  level: 0,
  junk: 50,
  energy: 0,
  cap: 100_000,
  growth: 417,
  range: 99,
  speed: 160,
  defense: 400,
  ...fields,
});
const home = planet(76_000, {
  owner: player,
  junkOwner: player,
  energy: 100_000,
});
const decide = (planets, options = {}) =>
  planCenterAdvance({
    planets,
    player,
    tickRate: 20,
    paused: false,
    innerRadius: 75_500,
    radius: 100_000,
    junkFree: 300,
    ...options,
  });

test("selects a productive inward route, avoiding protected planets and occupied queues", () => {
  const {
    actions: [route],
  } = decide([
    home,
    planet(75_900, { level: 1 }),
    planet(75_750, { level: 1, pending: 1 }),
    planet(75_700, { level: 1, energy: 20_000 }),
    planet(75_680, { level: 1 }),
    planet(75_450, { x: 75_670, level: 1 }),
  ]);
  assert.equal(route.target.radius, 75_680);
  assert.equal(route.sent, 99_999);
  assert.deepEqual(decide([home, route.target], { junkFree: 49 }).actions, []);
});

test("uses a stronger sideways relay when it unlocks the inward leg, then registers it", () => {
  const relay = planet(76_030, {
    level: 1,
    junk: 55,
    cap: 400_000,
    range: 177,
    growth: 833,
  });
  const inward = planet(75_525, { level: 2 });
  const {
    actions: [route],
  } = decide([home, relay, inward]);
  assert.equal(route.target.hash, relay.hash);
  assert.equal(route.nextHop.hash, inward.hash);
  const captured = { ...relay, owner: player, energy: route.seed };
  assert.equal(decide([home, captured, inward]).actions[0].action, "add-junk");
  assert.equal(
    decide([home, captured, inward], { paused: true }).reason,
    "ticker-paused",
  );
});

test("reselects its launch planet as ownership changes between rounds", () => {
  const relay = planet(75_680, { level: 1 });
  const next = planet(75_360, { level: 2 });
  const choices = { innerRadius: 75_000 };
  const {
    actions: [first],
  } = decide([home, relay, next], choices);
  assert.equal(first.from.hash, home.hash);
  assert.equal(first.target.hash, relay.hash);

  const lostHome = {
    ...home,
    owner: "0x0000000000000000000000000000000000000001",
  };
  const captured = { ...relay, owner: player, energy: 100_000 };
  const {
    actions: [register],
  } = decide([lostHome, captured, next], choices);
  assert.equal(register.action, "add-junk");
  assert.equal(register.target.hash, relay.hash);

  const {
    actions: [second],
  } = decide([lostHome, { ...captured, junkOwner: player }, next], choices);
  assert.equal(second.from.hash, relay.hash);
  assert.equal(second.target.hash, next.hash);
});

test("plans multiple independent launches and accounts for their combined junk cost", () => {
  const other = { ...home, hash: "second", y: 200 };
  const targets = [
    planet(75_790, { level: 1 }),
    planet(75_791, { y: 200, level: 1 }),
  ];
  const actions = decide([home, other, ...targets], { junkFree: 100 }).actions;
  assert.equal(actions.length, 2);
  assert.equal(new Set(actions.map((a) => a.from.hash)).size, 2);
  assert.equal(new Set(actions.map((a) => a.target.hash)).size, 2);
  assert.equal(
    decide([home, other, ...targets], { junkFree: 50 }).actions.length,
    1,
  );
});

test("evacuates the outermost planet first regardless of level, then releases junk before registering", () => {
  const outer = {
    ...home,
    hash: "outer",
    x: 76_080,
    radius: 76_080,
    level: 2,
    junk: 60,
    silver: 1000,
    materials: [{ resourceId: 4, amount: 200 }],
  };
  const nearer = {
    ...outer,
    hash: "nearer",
    x: 76_050,
    radius: 76_050,
    level: 0,
  };
  const inner = {
    ...home,
    hash: "inner",
    silver: 100,
    silverCap: 5000,
    level: 3,
    junk: 55,
  };
  const captured = planet(75_880, { owner: player, energy: 4000 });
  const planets = [outer, nearer, inner, captured];
  const options = { junkFree: 0 };
  const initial = decide(planets, options).actions;
  assert.equal(initial.length, 1);
  assert.equal(initial[0].purpose, "evacuate");
  assert.equal(initial[0].from.hash, outer.hash);
  assert.equal(initial[0].target.hash, inner.hash);
  assert.equal(initial[0].silver, 1000);
  assert.deepEqual(initial[0].materials, outer.materials);
  const ship = {
    fleetId: "1",
    to: inner.hash,
    arrivalTick: 100,
    status: "pending",
  };
  const nearerReady = { ...ship, fleetId: "2", status: "ready" };
  assert.deepEqual(
    decide(planets, {
      ...options,
      evacuations: new Map([
        [outer.hash, ship],
        [nearer.hash, nearerReady],
      ]),
    }).actions,
    [],
  );
  const settled = decide(planets, {
    ...options,
    evacuations: new Map([
      [outer.hash, { ...ship, status: "ready" }],
      [nearer.hash, nearerReady],
    ]),
  }).actions;
  assert.deepEqual(
    settled.map((a) => a.action),
    ["clear-junk", "add-junk"],
  );
  assert.equal(settled[0].target.hash, outer.hash);
  assert.deepEqual(settled[1].dependsOn, [0]);
});

test("preserves cargo if the only inner planet cannot fit it", () => {
  const outer = {
    ...home,
    hash: "outer",
    x: 76_080,
    radius: 76_080,
    silver: 1000,
  };
  const captured = planet(75_880, { owner: player, energy: 4000 });
  const { actions, reason } = decide([outer, { ...home, level: 1 }, captured], {
    junkFree: 0,
  });
  assert.deepEqual(actions, []);
  assert.equal(reason, "junk-quota-awaiting-evacuation");
});

test("prioritizes a capturable higher level even when it is slightly farther from the center", () => {
  const source = {
    ...home,
    level: 2,
    energy: 1_600_000,
    cap: 1_600_000,
    range: 315,
  };
  const inward = planet(75_820, { level: 1 });
  const upgrade = planet(76_045, {
    level: 3,
    cap: 6_000_000,
    energy: 32_000,
    defense: 300,
  });
  const {
    actions: [first],
  } = decide([source, inward, upgrade]);
  assert.equal(first.target.hash, upgrade.hash);
  const registered = decide([source, { ...upgrade, owner: player }, inward])
    .actions[0];
  assert.equal(registered.action, "add-junk");
  assert.equal(registered.target.hash, upgrade.hash);
});

test("rejects attacks and evacuation routes that drop two or more levels", () => {
  assert.equal(canSendFleet(2, 0), false);
  assert.equal(canSendFleet(4, 1), false);
  assert.equal(canSendFleet(2, 1), true);
  const levelTwo = {
    ...home,
    level: 2,
    range: 315,
    energy: 1_600_000,
    cap: 1_600_000,
  };
  const zero = planet(75_750);
  const one = planet(75_890, { level: 1, cap: 400_000, energy: 4_000 });
  const tooFar = planet(78_000, { level: 3 });
  const {
    actions: [attack],
  } = decide([levelTwo, zero, one, tooFar]);
  assert.equal(attack.target.hash, one.hash);
  assert.deepEqual(decide([levelTwo, zero]).actions, []);

  const outer = { ...levelTwo, hash: "outer", x: 76_080, radius: 76_080 };
  const captured = planet(75_940, { level: 1, owner: player, energy: 4000 });
  const { actions, reason } = decide([outer, home, captured], { junkFree: 0 });
  assert.deepEqual(actions, []);
  assert.equal(reason, "junk-quota-awaiting-evacuation");
});

test("does not rely on excess energy that can decay before a planned launch", () => {
  const reinforced = { ...home, energy: 103_051 };
  const target = planet(75_850, { level: 1 });
  const [action] = decide([reinforced, target]).actions;
  assert.equal(action.sent, 99_999);
  assert.ok(action.sent < reinforced.cap);
});

test("low-level sources prefer one level up, and weaken a target before it can be captured", () => {
  const nearer = planet(75_970, { level: 1, energy: 50_000 });
  const higher = planet(75_960, { level: 2 });
  const same = planet(75_999);
  const {
    actions: [first],
  } = decide([home, nearer, higher, same], { junkFree: 0 });
  assert.equal(first.target.hash, nearer.hash);
  assert.equal(first.captures, false);
  assert.ok(first.damage > 0);
  assert.deepEqual(decide([home, same]).actions, []);

  const incoming = {
    ...nearer,
    pending: 1,
    incoming: [{ captain: player, energy: 160_000 }],
  };
  const {
    actions: [finish],
  } = decide([home, incoming]);
  assert.equal(finish.captures, true);
  const alreadyEnough = {
    ...incoming,
    incoming: [{ captain: player, energy: 200_000 }],
  };
  assert.deepEqual(decide([home, alreadyEnough]).actions, []);
});

test("falls back only when the nearest higher planet would receive less than ten percent", () => {
  const source = {
    ...home,
    level: 3,
    cap: 800,
    energy: 101,
    range: 100,
  };
  const higher = planet(75_900, { level: 4 });
  const same = planet(75_994, { level: 3 });
  const lower = planet(75_995, { level: 2 });
  const tooLow = planet(75_996, { level: 1 });
  const [upward] = decide([source, higher, same, lower, tooLow]).actions;
  assert.equal(upward.target.hash, higher.hash);
  const weak = planet(75_899, { level: 4 });
  const {
    actions: [fallback],
  } = decide([source, weak, same, lower, tooLow]);
  assert.equal(fallback.target.hash, same.hash);
  assert.equal(
    decide([source, weak, lower, tooLow]).actions[0].target.hash,
    lower.hash,
  );
  assert.deepEqual(decide([source, same]).actions, []);
});

test("prefers a two-level jump at half the distance or less", () => {
  const one = planet(75_760, { level: 1 });
  const half = planet(75_880, { level: 2 });
  const overHalf = planet(75_879, { level: 2 });
  assert.equal(decide([home, one, half]).actions[0].target.hash, half.hash);
  assert.equal(decide([home, one, overHalf]).actions[0].target.hash, one.hash);
});

test("the ten percent rule also applies to low-level sources", () => {
  const farther = planet(75_650, { level: 1 });
  const same = planet(75_980);
  assert.equal(decide([home, farther, same]).actions[0].target.hash, same.hash);
});

test("a full planet launches along a legal route even if it does not move toward the center", () => {
  const full = { ...home, level: 2, energy: home.cap - 1 };
  const flank = planet(76_080, { level: 1 });
  const tooFar = planet(78_000, { level: 3 });
  const {
    actions: [launch],
    fullWaiting,
  } = decide([full, flank, tooFar]);
  assert.equal(launch.target.hash, flank.hash);
  assert.deepEqual(fullWaiting, []);
  assert.deepEqual(
    decide([{ ...full, energy: 80_000 }, flank, tooFar]).actions,
    [],
  );
});

test("same-level moves must strictly reduce distance to the center, even at full energy", () => {
  const source = { ...home, level: 2, y: 30, radius: Math.hypot(home.x, 30) };
  const outward = planet(76_008, { level: 2 });
  const lateral = { ...source, hash: "lateral", owner: neutral, y: -30 };
  const inward = planet(75_950, { level: 2 });
  const higher = planet(78_000, { level: 3 });
  assert.equal(canSendRoute(source, lateral), false);
  assert.equal(canSendRoute(source, { ...outward, level: 3 }), true);
  assert.deepEqual(decide([source, outward, lateral, higher]).actions, []);
  assert.equal(
    decide([source, outward, inward, higher]).actions[0].target.hash,
    inward.hash,
  );

  const ally = { ...outward, owner: player, junkOwner: player, energy: 10_000 };
  assert.deepEqual(decide([source, ally, higher]).actions, []);
});

test("full planets can converge on a target while its garrison still needs more than one fleet", () => {
  const second = { ...home, hash: "second", y: 8 };
  const third = { ...home, hash: "third", y: 16 };
  const target = planet(75_970, { level: 1, energy: 30_000 });
  const { actions, fullWaiting } = decide([home, second, third, target], {
    junkFree: 50,
  });
  assert.equal(actions.length, 2);
  assert.deepEqual(
    actions.map((action) => action.captures),
    [false, true],
  );
  assert.ok(actions.every((action) => action.target.hash === target.hash));
  assert.equal(fullWaiting.length, 1);
});

test("a full planet reinforces an eligible ally when it has no attack route", () => {
  const source = { ...home, level: 2 };
  const ally = {
    ...home,
    hash: "ally",
    x: 75_920,
    radius: 75_920,
    level: 3,
    energy: 30_000,
  };
  const [action] = decide([source, ally], { junkFree: 0 }).actions;
  assert.equal(action.purpose, "reinforce");
  assert.equal(action.target.hash, ally.hash);
  assert.equal(action.sent, source.cap - 1);
  assert.deepEqual(decide([source, { ...ally, level: 0 }]).actions, []);
});
