import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createContext, runInContext } from "node:vm";
import { Worker } from "node:worker_threads";
import { utils } from "ethers";
import {
  canSendRoute,
  cargoFits,
  cargoReplenished,
  planCenterAdvance,
  remainingGarrison,
} from "./early-center-plan.mjs";

const RPC = "http://127.0.0.1:8545";
const CHAIN = 31337;
const MULTICALL = "0xcA11bde05977b3631167028862bE2a173976CA11";
const MULTICALL_HASH =
  "0xd5c15df687b16f2ff992fc8d767b4216323184a2bbc6ee2f9c398c318e770891";
const PASS = "0x90c84237fddf091b1e63f369af122eb46000bc70";
const FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const client = new URL("../../", import.meta.url);
const worldAbi = new utils.Interface(
  JSON.parse(
    await readFile(
      new URL("../../../contracts/out/IWorld.sol/IWorld.json", import.meta.url),
      "utf8",
    ),
  ).abi,
);
const multicallAbi = new utils.Interface([
  "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[])",
  "function getEthBalance(address) view returns (uint256)",
]);
const passAbi = new utils.Interface([
  "function activeWorld() view returns (address)",
  "function activeSeason() view returns (uint256)",
  "function isSeasonOpen() view returns (bool)",
  "function isPlayerInActiveSeason(address) view returns (bool)",
]);
const storeAbi = new utils.Interface([
  "function getRecord(bytes32, bytes32[]) view returns (bytes, bytes32, bytes)",
]);
const storeEvents = new utils.Interface([
  "event Store_SetRecord(bytes32 indexed tableId, bytes32[] keyTuple, bytes staticData, bytes32 encodedLengths, bytes dynamicData)",
  "event Store_SpliceStaticData(bytes32 indexed tableId, bytes32[] keyTuple, uint48 start, bytes data)",
  "event Store_DeleteRecord(bytes32 indexed tableId, bytes32[] keyTuple)",
]);
const word = (value) => utils.hexZeroPad(utils.hexlify(value), 32);
const tableId = (name) =>
  "0x" +
  Buffer.concat([
    Buffer.from("tbdf"),
    Buffer.alloc(12),
    Buffer.from(name),
    Buffer.alloc(16 - name.length),
  ]).toString("hex");
const hex = (value) => "0x" + BigInt(value).toString(16);
const number = (value) => {
  const result = Number(BigInt(value));
  if (!Number.isSafeInteger(result))
    throw new Error("Chain value exceeds safe integer range");
  return result;
};

export async function readRpc(method, params = []) {
  if (
    ![
      "eth_chainId",
      "eth_getBlockByNumber",
      "eth_getCode",
      "eth_getLogs",
      "eth_call",
      "eth_getTransactionCount",
      "eth_getTransactionReceipt",
    ].includes(method)
  ) {
    throw new Error(`Read-only RPC cannot call ${method}`);
  }
  const response = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const result = await response.json();
  if (result.error)
    throw new Error(
      `${method}: ${result.error.message} ${result.error.data ?? ""}`,
    );
  return result.result;
}
const rpc = readRpc;

function call(target, abi, method, args = []) {
  return { target, abi, method, data: abi.encodeFunctionData(method, args) };
}

export function fixedBlockReader(request, blockTag, world) {
  if (!/^0x[0-9a-f]+$/i.test(blockTag))
    throw new Error("Expected a fixed block number");
  const allowedTargets = new Set(
    [world, PASS, MULTICALL].map((a) => a.toLowerCase()),
  );
  return async function batch(calls) {
    const decoded = [];
    for (let offset = 0; offset < calls.length; offset += 24) {
      const group = calls.slice(offset, offset + 24);
      if (group.some((c) => !allowedTargets.has(c.target.toLowerCase())))
        throw new Error("Unexpected batch target");
      const data = multicallAbi.encodeFunctionData("aggregate3", [
        group.map((c) => [c.target, false, c.data]),
      ]);
      const response = await request("eth_call", [
        { to: MULTICALL, data },
        blockTag,
      ]);
      const results = multicallAbi.decodeFunctionResult(
        "aggregate3",
        response,
      )[0];
      if (results.length !== group.length || results.some((r) => !r.success)) {
        throw new Error("Incomplete Multicall3 results");
      }
      for (const [i, result] of results.entries()) {
        const { abi, method } = group[i];
        decoded.push(abi.decodeFunctionResult(method, result.returnData));
      }
    }
    return decoded;
  };
}

async function readSave(folder) {
  const [agent, game, homes, board, history] = await Promise.all([
    ...[
      "agent.json",
      "game.json",
      "homeLocations.json",
      "knownBoard.ndjson",
    ].map((name) => readFile(join(folder, name), "utf8")),
    readFile(join(folder, "actions.ndjson"), "utf8").catch((error) => {
      if (error.code === "ENOENT") return "";
      throw error;
    }),
  ]);
  const shipments = new Map();
  for (const line of history.split("\n").filter((line) => line.trim())) {
    const row = JSON.parse(line);
    if (row.action === "clear-junk") shipments.delete(row.planet);
    if (row.action !== "move") continue;
    shipments.delete(row.from);
    if (row.purpose === "evacuate" && row.fleetId && row.tx)
      shipments.set(row.from, row);
  }
  const player = utils.getAddress(JSON.parse(agent).address).toLowerCase();
  const { chainId, world, season } = JSON.parse(game);
  if (chainId !== CHAIN)
    throw new Error("Expected a local Anvil save for chain 31337");
  const points = new Map();
  const addPoint = ({ h, x, y, p, b }) => {
    const hash = h.replace(/^0x/, "").toLowerCase();
    if (
      !/^[0-9a-f]{64}$/.test(hash) ||
      ![x, y, p, b].every(Number.isSafeInteger)
    ) {
      throw new Error("Invalid planet coordinates or proof inputs in save");
    }
    points.set(hash, {
      hash,
      x,
      y,
      perlin: p,
      biome: b,
      radius: Math.hypot(x, y),
    });
  };
  for (const line of board.split("\n").filter((line) => line.trim())) {
    for (const point of JSON.parse(line).l) addPoint(point);
  }
  for (const home of JSON.parse(homes)) {
    addPoint({
      h: home.hash,
      ...home.coords,
      p: home.perlin,
      b: home.biomebase,
    });
  }
  return {
    player,
    world: utils.getAddress(world),
    season,
    shipments,
    points: [...points.values()],
  };
}

export async function readMapEvents(request, world, blockTag, player) {
  const ownerTable = tableId("PlanetOwner");
  const revealedTable = tableId("RevealedPlanet");
  const logs = await request("eth_getLogs", [
    {
      address: world,
      fromBlock: "0x0",
      toBlock: blockTag,
      topics: [
        Object.keys(storeEvents.events).map((event) =>
          storeEvents.getEventTopic(event),
        ),
        [ownerTable, revealedTable],
      ],
    },
  ]);
  logs.sort(
    (a, b) =>
      number(a.blockNumber) - number(b.blockNumber) ||
      number(a.logIndex) - number(b.logIndex),
  );
  const owned = new Set();
  const revealed = new Map();
  for (const log of logs) {
    const { name, args } = storeEvents.parseLog(log);
    const hash = args.keyTuple[0].slice(2);
    if (args.tableId === ownerTable) {
      if (name === "Store_SpliceStaticData" && number(args.start) !== 0)
        throw new Error("Invalid PlanetOwner update");
      if (name === "Store_DeleteRecord") owned.delete(hash);
      else if (
        "0x" + bytes(args.staticData ?? args.data, 20).toString("hex") ===
        player
      )
        owned.add(hash);
      else owned.delete(hash);
    } else if (name === "Store_DeleteRecord") {
      revealed.delete(hash);
    } else if (name === "Store_SetRecord") {
      const data = bytes(args.staticData, 28);
      const x = data.readInt32BE(0);
      const y = data.readInt32BE(4);
      revealed.set(hash, { hash, x, y, radius: Math.hypot(x, y) });
    }
  }
  return { owned, revealed };
}

function bytes(value, size) {
  const data = Buffer.from(value.slice(2), "hex");
  if (data.length !== size)
    throw new Error(`Expected ${size} record bytes, got ${data.length}`);
  return data;
}

const recordCall = (world, name, keys = []) =>
  call(world, storeAbi, "getRecord", [tableId(name), keys]);

export async function readIncomingFleets(batch, world, planets) {
  const queues = planets.map(() => []);
  const requests = [];
  for (const [i, planet] of planets.entries()) {
    for (let offset = 0; offset < planet.pending; offset++) {
      const index =
        planet.queue.indexes[(number(planet.queue.head) + offset) % 30];
      requests.push({
        queue: queues[i],
        call: recordCall(world, "Move", ["0x" + planet.hash, word(index)]),
      });
    }
  }
  const moves = await batch(requests.map((request) => request.call));
  for (const [i, [data]] of moves.entries()) {
    const fleet = bytes(data, 124);
    requests[i].queue.push({
      captain: "0x" + fleet.subarray(40, 60).toString("hex"),
      energy: number(fleet.readBigUInt64BE(76)),
    });
  }
  return queues;
}

async function readMaterials(batch, world, planets) {
  const requests = [];
  const materials = planets.map(({ materialStorage }, i) =>
    materialStorage.exists.flatMap((exists, resourceId) => {
      if (!exists || resourceId === 0) return [];
      const material = {
        resourceId,
        grows: materialStorage.growth[resourceId],
        amount: number(materialStorage.amount[resourceId]),
      };
      if (!materialStorage.updates[resourceId]) {
        requests.push({
          material,
          call: recordCall(world, "PlanetMaterial", [
            word(planets[i].planetHash),
            word(resourceId),
          ]),
        });
      }
      return [material];
    }),
  );
  const result = await batch(requests.map((entry) => entry.call));
  for (const [i, [data]] of result.entries()) {
    requests[i].material.amount = data === "0x" ? 0 : number(data);
  }
  return materials;
}

function cargoState(planet, materials) {
  return {
    silver: number(planet.silver),
    silverCap: number(planet.silverCap),
    silverGrowth: number(planet.silverGrowth),
    materials,
    artifacts: number(planet.artifactStorage.number),
  };
}

function settleClock(ticker, timestamp) {
  const data = bytes(ticker, 25);
  const tickRate = number(data.readBigUInt64BE(8));
  const paused = data[24] !== 0;
  const seconds = number(timestamp) - number(data.readBigUInt64BE(16));
  if (seconds < 0)
    throw new Error("Ticker timestamp is newer than the snapshot");
  const elapsed = paused ? 0n : BigInt(seconds) * BigInt(tickRate);
  return {
    tick: number(data.readBigUInt64BE(0) + elapsed),
    tickRate,
    paused,
    elapsed,
  };
}

async function verifiedBatch(block, world, request = rpc) {
  const code = await request("eth_getCode", [MULTICALL, block]);
  if (utils.keccak256(code) !== MULTICALL_HASH) {
    throw new Error("Multicall3 bytecode does not match this session");
  }
  return fixedBlockReader(request, block, world);
}

function projectedInnerRadius(circle, elapsed) {
  const inner = bytes(circle, 24);
  const remaining =
    inner.readBigUInt64BE(8) - inner.readBigUInt64BE(16) * elapsed;
  return remaining > 0n ? number(remaining / 1000n) : 0;
}

export async function readWorldBoundary(world, request = rpc) {
  if (number(await request("eth_chainId")) !== CHAIN)
    throw new Error("Wrong chain");
  const block = await request("eth_getBlockByNumber", ["latest", false]);
  const batch = await verifiedBatch(block.number, world, request);
  const [[ticker], [circle], [universe]] = await batch(
    ["Ticker", "InnerCircle", "UniverseConfig"].map((name) =>
      recordCall(world, name),
    ),
  );
  const { elapsed } = settleClock(ticker, block.timestamp);
  return {
    block: block.number,
    innerRadius: projectedInnerRadius(circle, elapsed),
    worldRadius: number(bytes(universe, 16).readBigUInt64BE(8)),
  };
}

async function takeSnapshot(save) {
  const { player, world, season } = save;
  if (number(await rpc("eth_chainId")) !== CHAIN)
    throw new Error("Wrong chain");
  const block = await rpc("eth_getBlockByNumber", ["latest", false]);
  const batch = await verifiedBatch(block.number, world);
  const record = (name, keys) => recordCall(world, name, keys);
  const [
    [activeWorld],
    [activeSeason],
    [open],
    [joined],
    [balance],
    [ticker],
    [circle],
    [universe],
    [snark],
    [fee],
    [used],
    [limit],
    [junkConfig, , junkLevels],
    [spawn],
  ] = await batch([
    ...["activeWorld", "activeSeason", "isSeasonOpen"].map((method) =>
      call(PASS, passAbi, method),
    ),
    call(PASS, passAbi, "isPlayerInActiveSeason", [player]),
    call(MULTICALL, multicallAbi, "getEthBalance", [player]),
    ...[
      "Ticker",
      "InnerCircle",
      "UniverseConfig",
      "SnarkConfig",
      "EntryFee",
    ].map((name) => record(name)),
    ...["PlayerJunk", "PlayerJunkLimit", "JunkConfig", "SpawnPlanet"].map(
      (name) => record(name, name === "JunkConfig" ? [] : [word(player)]),
    ),
  ]);
  if (
    !open ||
    !joined ||
    activeWorld !== world ||
    number(activeSeason) !== season
  ) {
    throw new Error("Wallet is not in the saved world's active season");
  }
  if (!save.points.some((p) => "0x" + p.hash === spawn))
    throw new Error("On-chain home is missing from the save");
  if (!Buffer.from(junkConfig.slice(2), "hex")[0])
    throw new Error("Expected space junk to be enabled");
  if (junkLevels.length !== 2 + 10 * 64)
    throw new Error("Unexpected junk cost table");
  const junkCosts = junkLevels
    .slice(2)
    .match(/.{64}/g)
    .map((cost) => number("0x" + cost));
  const { tick, tickRate, paused, elapsed } = settleClock(
    ticker,
    block.timestamp,
  );
  const innerRadius = projectedInnerRadius(circle, elapsed);
  const radius = number(bytes(universe, 16).readBigUInt64BE(8));
  const config = bytes(snark, 34);
  const proofConfig = {
    PLANETHASH_KEY: String(config.readBigUInt64BE(0)),
    BIOMEBASE_KEY: String(config.readBigUInt64BE(8)),
    SPACETYPE_KEY: String(config.readBigUInt64BE(16)),
    SCALE: String(config.readBigUInt64BE(24)),
    xMirror: String(config[32]),
    yMirror: String(config[33]),
  };

  const { owned, revealed } = await readMapEvents(
    rpc,
    world,
    block.number,
    player,
  );
  const locations = new Map(save.points.map((p) => [p.hash, p]));
  for (const [hash, point] of revealed) {
    if (!locations.has(hash)) locations.set(hash, point);
  }
  // A hash alone cannot be used to make a move proof. Still settle its current
  // ownership so the result can explain which holdings lack coordinates.
  for (const hash of owned) {
    if (!locations.has(hash)) locations.set(hash, { hash });
  }
  const points = [...locations.values()];

  // Use the coordinate overload only for unknown planets. Initialized planets can
  // be settled at the precise tick by the same Solidity logic that handles moves.
  const constants = await batch(
    points.map((p) => record("PlanetConstants", ["0x" + p.hash])),
  );
  const result = await batch(
    points.map((p, i) => {
      const id = "0x" + p.hash;
      const data = constants[i][0];
      if (data !== "0x" && bytes(data, 4)[2])
        return call(world, worldAbi, "df__readPlanetAt", [id, tick]);
      if (p.perlin === undefined)
        throw new Error(`Uninitialized planet has no map data: ${p.hash}`);
      return call(world, worldAbi, "df__readPlanet(uint256,uint256,uint256)", [
        id,
        p.perlin,
        p.x ** 2 + p.y ** 2,
      ]);
    }),
  );
  const holdings = [];
  const planets = [];
  const cargo = await readMaterials(
    batch,
    world,
    result.map(([planet]) => planet),
  );
  for (const [i, [p]] of result.entries()) {
    const level = number(p.level);
    const planet = {
      ...points[i],
      perlin: number(p.perlin),
      owner: p.owner.toLowerCase(),
      junkOwner: p.junkOwner.toLowerCase(),
      destroyed: number(p.status) !== 0,
      pending: number(p.moveQueue.number),
      queue: p.moveQueue,
      level,
      junk: junkCosts[level],
      energy: number(p.population),
      cap: number(p.populationCap),
      growth: number(p.populationGrowth),
      range: number(p.range),
      speed: number(p.speed),
      defense: number(p.defense),
      effects: number(p.effectNumber),
      ...cargoState(p, cargo[i]),
    };
    if (planet.owner === player && !planet.destroyed) holdings.push(planet);
    if (planet.x !== undefined) planets.push(planet);
  }

  // A partial attack only needs quota once the combined damage can capture.
  const contested = planets.filter((p) => p.pending && p.owner !== player);
  const incoming = await readIncomingFleets(batch, world, contested);
  let reserved = 0;
  for (const [i, planet] of contested.entries()) {
    planet.incoming = incoming[i];
    if (
      planet.junkOwner === player ||
      !planet.incoming.some((fleet) => fleet.captain === player)
    )
      continue;
    const neutral = planet.owner === "0x" + "0".repeat(40);
    const left = remainingGarrison(planet, player);
    if (!neutral || left === 0 || left === null) reserved += planet.junk;
  }
  const junkFree = number(limit) - number(used) - reserved;
  const ownedByHash = new Map(holdings.map((p) => [p.hash, p]));
  const shipments = [];
  for (const row of save.shipments.values()) {
    if (
      ownedByHash.get(row.from)?.junkOwner !== player ||
      !ownedByHash.has(row.to)
    )
      continue;
    const receipt = await rpc("eth_getTransactionReceipt", [row.tx]);
    if (
      receipt?.status !== "0x1" ||
      number(receipt.blockNumber) > number(block.number)
    )
      continue;
    const { fleetId, arrivalTick } = readEvacuationReceipt(
      receipt,
      { from: player, to: world },
      {
        from: { hash: row.from },
        target: { hash: row.to },
      },
    );
    if (fleetId !== row.fleetId || arrivalTick !== row.arrivalTick)
      throw new Error("Evacuation history disagrees with its receipt");
    shipments.push(row);
  }
  const recallStatus = await batch(
    shipments.map((row) =>
      call(world, worldAbi, "df__isMoveReverted", [row.fleetId]),
    ),
  );
  const evacuations = new Map();
  for (const [i, row] of shipments.entries()) {
    const receiver = ownedByHash.get(row.to);
    if (!receiver || recallStatus[i][0]) continue;
    if (
      tick >= row.arrivalTick &&
      cargoReplenished(ownedByHash.get(row.from), tick - row.snapshotTick)
    )
      continue;
    evacuations.set(row.from, {
      ...row,
      status: tick < row.arrivalTick ? "pending" : "ready",
    });
  }
  return {
    player,
    world,
    block: block.number,
    blockHash: block.hash,
    tick,
    tickRate,
    paused,
    innerRadius,
    radius,
    entryFee: BigInt(fee),
    balance: BigInt(balance.toString()),
    proofConfig,
    planets,
    holdings,
    junkFree,
    evacuations,
  };
}

export async function checkPlanOwnership(plan, tx) {
  // Validate the selected action before signing. Never substitute a new action.
  const block = await rpc("eth_getBlockByNumber", ["latest", false]);
  const batch = await verifiedBatch(block.number, tx.to);
  const record = (name, keys = []) =>
    call(tx.to, storeAbi, "getRecord", [tableId(name), keys]);
  const targetId = "0x" + plan.target.hash;
  const [[ticker], [constants]] = await batch([
    record("Ticker"),
    record("PlanetConstants", [targetId]),
  ]);
  const { tick, tickRate, paused } = settleClock(ticker, block.timestamp);
  if (paused || !tickRate) throw new Error("Ticker stopped after planning");

  const at = (id) => call(tx.to, worldAbi, "df__readPlanetAt", [id, tick]);
  const isInitialized = constants !== "0x" && bytes(constants, 4)[2] !== 0;
  if (plan.action === "clear-junk") {
    if (!isInitialized) throw new Error("Abandonment target is missing");
    const checks = [at(targetId)];
    const shipment = plan.shipment;
    if (shipment) {
      checks.push(
        at("0x" + shipment.to),
        call(tx.to, worldAbi, "df__isMoveReverted", [shipment.fleetId]),
      );
    }
    const [[target], receiver, recalled] = await batch(checks);
    const [materials] = await readMaterials(batch, tx.to, [target]);
    const cargo = cargoState(target, materials);
    const elapsed = shipment ? Math.max(0, tick - shipment.snapshotTick) : 0;
    if (
      target.owner.toLowerCase() !== tx.from ||
      target.junkOwner.toLowerCase() !== tx.from ||
      number(target.status) !== 0 ||
      number(target.effectNumber) !== 0 ||
      number(target.moveQueue.number) !== 0 ||
      cargo.artifacts ||
      cargoReplenished(cargo, elapsed) ||
      (shipment
        ? tick < shipment.arrivalTick ||
          receiver[0].owner.toLowerCase() !== tx.from ||
          recalled[0]
        : number(target.population) > 1)
    ) {
      throw new Error(
        "Abandonment conditions changed or evacuation has not arrived",
      );
    }
    return;
  }
  if (plan.action === "add-junk") {
    if (!isInitialized) throw new Error("Registration target is missing");
    const [[target]] = await batch([at(targetId)]);
    if (
      target.owner.toLowerCase() !== tx.from ||
      target.junkOwner.toLowerCase() === tx.from ||
      number(target.status) !== 0 ||
      number(target.moveQueue.number) !== 0
    ) {
      throw new Error("Registration target changed after planning");
    }
    return;
  }

  const [, input] = worldAbi.decodeFunctionData("df__move", tx.data);
  const targetCall = isInitialized
    ? at(targetId)
    : call(tx.to, worldAbi, "df__readPlanet(uint256,uint256,uint256)", [
        targetId,
        input[2],
        input[10],
      ]);
  const [[source], [target]] = await batch([
    at("0x" + plan.from.hash),
    targetCall,
  ]);
  if (
    !canSendRoute(
      { ...plan.from, level: number(source.level) },
      { ...plan.target, level: number(target.level) },
    )
  ) {
    throw new Error(
      "Fleet route is blocked by the level or inward movement rule",
    );
  }
  const friendly = plan.purpose === "evacuate" || plan.purpose === "reinforce";
  if (
    source.owner.toLowerCase() !== tx.from ||
    source.junkOwner.toLowerCase() !== tx.from ||
    number(source.status) !== 0 ||
    number(source.moveQueue.number) !== 0 ||
    number(source.population) <= plan.sent ||
    number(source.effectNumber) !== 0 ||
    target.owner.toLowerCase() !==
      (friendly ? tx.from : "0x" + "0".repeat(40)) ||
    number(target.status) !== 0 ||
    (friendly &&
      (target.junkOwner.toLowerCase() !== tx.from ||
        number(target.moveQueue.number) !== 0)) ||
    number(target.moveQueue.number) >= 30 ||
    number(target.effectNumber) !== 0
  ) {
    throw new Error("Attack source or target changed after planning");
  }
  if (plan.purpose === "evacuate") {
    const [materials] = await readMaterials(batch, tx.to, [target]);
    if (
      target.junkOwner.toLowerCase() !== tx.from ||
      number(source.artifactStorage.number) ||
      !cargoFits(
        cargoState(target, materials),
        plan.silver,
        plan.materials,
        plan.travelTicks,
      )
    ) {
      throw new Error("Evacuation cargo or destination changed after planning");
    }
  } else if (number(target.moveQueue.number) !== 0) {
    const observed = {
      hash: plan.target.hash,
      pending: number(target.moveQueue.number),
      queue: target.moveQueue,
      energy: number(target.population),
      defense: number(target.defense),
    };
    const [incoming] = await readIncomingFleets(batch, tx.to, [observed]);
    const left = remainingGarrison({ ...observed, incoming }, tx.from);
    if (left === null || left === 0)
      throw new Error("Incoming fleets changed after attack planning");
  }
}

export function readEvacuationReceipt(receipt, tx, action) {
  const moveTable = tableId("Move");
  const topic = storeEvents.getEventTopic("Store_SetRecord");
  for (const log of receipt.logs) {
    if (
      log.address.toLowerCase() !== tx.to.toLowerCase() ||
      log.topics[0] !== topic ||
      log.topics[1] !== moveTable
    )
      continue;
    const { args } = storeEvents.parseLog(log);
    if (args.keyTuple[0] !== "0x" + action.target.hash) continue;
    const fleet = bytes(args.staticData, 124);
    if (
      fleet.subarray(0, 32).toString("hex") !== action.from.hash ||
      "0x" + fleet.subarray(40, 60).toString("hex") !== tx.from
    )
      continue;
    return {
      fleetId: fleet.readBigUInt64BE(32).toString(),
      arrivalTick: number(fleet.readBigUInt64BE(68)),
    };
  }
  throw new Error("Confirmed evacuation receipt has no matching fleet");
}

async function prove(circuit, inputs, expected) {
  // The client ships a browser bundle. Run its curve engine in single-threaded mode in Node.
  const source = await readFile(
    new URL("public/snarkjs.min.js", client),
    "utf8",
  );
  const buildEngine = "async function De(t, e) {";
  if (!source.includes(buildEngine))
    throw new Error("Unsupported bundled snarkjs version");
  const context = createContext({
    console,
    Worker,
    setTimeout,
    clearTimeout,
    setImmediate,
    clearImmediate,
    queueMicrotask,
    Buffer,
    process,
    URL,
    TextEncoder,
    TextDecoder,
    btoa,
    atob,
    performance,
    Uint8Array,
    ArrayBuffer,
  });
  context.self = context;
  context.global = context;
  runInContext(
    source.replace(buildEngine, buildEngine + " t = true;"),
    context,
    { filename: "snarkjs.min.js" },
  );
  const [wasm, zkey] = await Promise.all(
    ["wasm", "zkey"].map((ext) =>
      readFile(new URL(`src/Shared/snarks/${circuit}.${ext}`, client)),
    ),
  );
  const { proof, publicSignals } = await context.snarkjs.groth16.fullProve(
    inputs,
    wasm,
    zkey,
  );
  if (
    publicSignals.length !== expected.length ||
    publicSignals.some(
      (v, i) => expected[i] !== undefined && BigInt(v) !== BigInt(expected[i]),
    )
  ) {
    throw new Error("Proof public signals do not match the planned action");
  }
  return {
    proof: [
      proof.pi_a.slice(0, 2),
      proof.pi_b.slice(0, 2).map((p) => p.slice(0, 2).reverse()),
      proof.pi_c.slice(0, 2),
    ],
    publicSignals,
  };
}

const fieldCoordinate = (coordinate) =>
  ((BigInt(coordinate) + FIELD) % FIELD).toString();

export async function prepareAction(snapshot, action) {
  const {
    PLANETHASH_KEY,
    BIOMEBASE_KEY,
    SPACETYPE_KEY,
    SCALE,
    xMirror,
    yMirror,
  } = snapshot.proofConfig;
  const { from, target, sent, proofDistance } = action;
  if (from && !canSendRoute(from, target)) {
    throw new Error(
      "Fleet route is blocked by the level or inward movement rule",
    );
  }
  const shared = { PLANETHASH_KEY, SCALE, xMirror, yMirror };
  let data;
  if (action.action === "clear-junk") {
    data = worldAbi.encodeFunctionData("df__clearJunk", ["0x" + target.hash]);
  } else if (action.action === "add-junk") {
    const { proof, publicSignals } = await prove(
      "biomebase",
      {
        ...shared,
        BIOMEBASE_KEY,
        x: fieldCoordinate(target.x),
        y: fieldCoordinate(target.y),
      },
      [
        "0x" + target.hash,
        target.biome,
        PLANETHASH_KEY,
        BIOMEBASE_KEY,
        SCALE,
        xMirror,
        yMirror,
      ],
    );
    data = worldAbi.encodeFunctionData("df__addJunk", [
      "0x" + target.hash,
      publicSignals[1],
      proof,
    ]);
  } else {
    const square = target.x ** 2 + target.y ** 2;
    const signals = [
      "0x" + from.hash,
      "0x" + target.hash,
      target.perlin,
      snapshot.radius,
      proofDistance,
      PLANETHASH_KEY,
      SPACETYPE_KEY,
      SCALE,
      xMirror,
      yMirror,
      square,
    ];
    const { proof } = await prove(
      "move",
      {
        ...shared,
        SPACETYPE_KEY,
        x1: fieldCoordinate(from.x),
        y1: fieldCoordinate(from.y),
        x2: fieldCoordinate(target.x),
        y2: fieldCoordinate(target.y),
        r: String(snapshot.radius),
        distMax: String(proofDistance),
        targetDistFromOriginSquare: String(square),
      },
      signals,
    );
    data = worldAbi.encodeFunctionData("df__move", [
      proof,
      signals,
      sent,
      action.silver ?? 0,
      0,
      action.materials ?? [],
    ]);
  }
  const tx = {
    from: snapshot.player,
    to: snapshot.world,
    data,
    value: hex(snapshot.entryFee),
  };
  // This is a simulation of one state-changing player call, with the actual sender.
  await rpc("eth_call", [tx, "latest"]);
  return tx;
}

const point = ({ hash, x, y, level }) => ({ hash, x, y, level });

export async function buildRound(folder) {
  const save = await readSave(folder);
  const snapshot = await takeSnapshot(save);
  const { actions, reason, fullWaiting = [] } = planCenterAdvance(snapshot);
  const result = {
    block: snapshot.block,
    blockHash: snapshot.blockHash,
    tick: snapshot.tick,
    tickRate: snapshot.tickRate,
    innerRadius: snapshot.innerRadius,
    knownPlanets: snapshot.planets.length,
    holdings: snapshot.holdings.map((planet) => ({
      ...point(planet),
      energy: planet.energy,
      cap: planet.cap,
      registered: planet.junkOwner === snapshot.player,
      coordinatesKnown: planet.x !== undefined,
    })),
    junkFree: snapshot.junkFree,
    fullWaiting: fullWaiting.map(point),
    reason,
  };
  return { snapshot, actions, result };
}

export function describeAction(action, tickRate) {
  const {
    from,
    target,
    sent,
    arriving,
    seed,
    inwardGain,
    nextHop,
    nextHopReadySeconds,
  } = action;
  return {
    action: action.action,
    purpose: action.purpose,
    dependsOn: action.dependsOn,
    target: point(target),
    from: from && point(from),
    sent,
    arriving,
    damage: action.damage,
    captures: action.captures,
    seed,
    silver: action.silver,
    materials: action.materials,
    inwardGain,
    nextHop: nextHop && point(nextHop),
    nextHopReadySeconds,
    travelSeconds: from ? Math.ceil(action.travelTicks / tickRate) : undefined,
  };
}

export async function runRound(folder, { simulate = false } = {}) {
  const { snapshot, actions, result } = await buildRound(folder);
  const previews = [];
  for (const action of actions) {
    const preview = describeAction(action, snapshot.tickRate);
    if (simulate) {
      if (action.dependsOn?.length)
        preview.simulation = "requires-prior-receipts";
      else {
        preview.transaction = await prepareAction(snapshot, action);
        preview.simulation = "passed";
      }
    }
    previews.push(preview);
  }
  return { ...result, actions: previews };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [, , folder, flag, ...extra] = process.argv;
  if (!folder || extra.length || (flag && flag !== "--simulate")) {
    console.error(
      `Usage: node ${fileURLToPath(import.meta.url)} <wallet-save-dir> [--simulate]`,
    );
    process.exitCode = 1;
  } else {
    try {
      console.log(
        JSON.stringify(
          await runRound(resolve(folder), { simulate: flag === "--simulate" }),
          null,
          2,
        ),
      );
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
