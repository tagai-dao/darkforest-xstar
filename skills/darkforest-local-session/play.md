# Play

Use this after the home exists. Map mining stays in [mining.md](mining.md). Do not choose mining from a strategy.

How to send each action, and what it changes, is [actions.md](actions.md). That catalog is the full set of player calls. The map, planet stats, combat, upgrades, junk, and stake are [rules.md](rules.md). Read the current strategy file for the goal and the method. Choose the calls from the catalog. Do not invent a call that is not in the catalog, and do not call the closed admin systems named there.

## Strategies on disk

When the wallet folder is created, copy these four files from this skill directory into `<wallet>/strategies/`:

- `aggressive.md`
- `conservative.md`
- `offensive.md`
- `profit.md`

If `strategies/` already exists, copy only the names that are missing. Do not overwrite a file that is already there.

`strategy.txt` in the wallet folder is one line: the filename in use, for example `aggressive.md`. No directory prefix. After a new home is saved, that choice is part of the mining question in [mining.md](mining.md), not a later separate stop. If `strategy.txt` is still missing when play starts, ask which of the four filenames to use, write that single line, and wait.

Each round, read `strategy.txt`, then read `strategies/` plus that filename. The filename may be one of the four presets or a custom file in that same folder. Decide once from that file and the latest lists. That one prediction is zero or more actions. Zero means send nothing this round. More than one is a sequence, ordered so a later call can use the receipt of the earlier one.

## What this round reads

Refresh the lists in the next section, then read all of them before the prediction. The prediction is one judgment over every row. A round that looks only at the planet with a fleet in flight, the planet used by the previous call, or the home, has not started.

The files are `planets/owned.json`, `planets/discovered.json`, `planets/others.json`, `planets/revealed.json`, `planets/voyages.json`, and the latest line of `snapshots.ndjson`.

`owned.json` is every planet this wallet owns. For each row, use energy, energy cap, silver, junk owner, type, level, range, speed, defense, upgrades, and the voyages to and from it. A planet that already has a fleet in flight stays in that read. A planet this round does not launch from stays in that read. Set those owned planets next to the known planets in `discovered.json` and `others.json`, including their levels, types, defenses, and coordinates. The calls come from that comparison. `revealed.json` supplies coordinates the map log does not have. The snapshot supplies junk, score, stake, and the inner circle for the same decision.

When the owner changes strategy, write their text to a new file under `strategies/` if it is not one of the four names, replace the one line in `strategy.txt` with the new filename, and append an `actions.ndjson` line whose `action` is `switch-strategy` and whose `strategy` is the new filename. Leave fleets that are already in flight. Leave `funds.json` until the owner changes the cap. Finish the sequence already being sent, then use the new file on the next round.

## One round is a sequence

Make one prediction after every file in [What this round reads](#what-this-round-reads) has been read. Do not start it from a stale read, and do not start it from a single planet. The same rule applies to a custom strategy file: predict once, then execute zero or more calls. The strategy file states the goal and the method. The calls, their order, and how many of them, including none, come from that and from [actions.md](actions.md). Order the calls so each one is useful because of the receipt before it.

Send the first call. Wait for a successful transaction receipt. Only then append that action's line, using the receipt's block timestamp in UTC under the exact key `time`; do not use local wall-clock time or the key `at`. Store the receipt transaction hash in `tx`. If a transaction reverts, remains pending, or has no receipt, append no executed-action record and stop the sequence. Then send the next call. Wait for the transaction receipt, not for a fleet to arrive and not for the ticker to advance. Do not rebuild the planet lists between calls in the same sequence.

Stop the remaining calls when a receipt reverts, when the AIPRO cap or the owner's answer blocks a spend, or when the next call needed a receipt that failed. Tell the owner which call stopped the sequence. Leave the later calls unsent.

When the sequence has finished, or the prediction was zero calls, read the lists again before the next prediction. Do not put map mining into the sequence.

## Lists the agent reads

Do not load `knownBoard.ndjson` into the decision. Each round, refresh the files below, then decide from those files only.

| File                      | Rows                                                                           |
| ------------------------- | ------------------------------------------------------------------------------ |
| `planets/discovered.json` | Every planet hash in the map log, plus revealed hashes that are not in the log |
| `planets/owned.json`      | Owner equals this wallet                                                       |
| `planets/others.json`     | Owner is some other non-zero address                                           |
| `planets/revealed.json`   | Coordinates someone published on chain                                         |
| `voyages.json`            | Fleets in flight to the destination set below                                  |

Rewrite `discovered.json`, `owned.json`, `others.json`, `revealed.json`, and `voyages.json` in full. A planet object has `x`, `y`, `hash`, `level`, `type`, `spaceType`, `perlin`, `owner`, `junkOwner`, `addJunkTick`, `junkCost`, `energy`, `energyCap`, `energyGrowth`, `silver`, `silverCap`, `silverGrowth`, `range`, `speed`, `defense`, `upgrades`, `lastUpdateTick`, `readAt`. What each field changes is [planets.md](planets.md). Chain units for energy and silver, and for their caps and growth, are display amounts times 1000. `junkCost` is `50, 55, 60, 65, 75, 100, 200, 250, 300, 500` for levels 0 through 9. A revealed row has `hash`, `x`, `y`, `revealer`, `readAt`. Use the revealed coordinates for a hash that is not in the map log. What an artifact does after it is found is [artifacts.md](artifacts.md).

Also append one line to `snapshots.ndjson` with `tick`, `tickRate`, `timestamp`, `paused`, `innerRadius`, `aiproBalance`, `totalStaked`, `myStaked`, `pendingCommunity`, `pendingInjected`, `pool`, `junkUsed`, `junkLimit`, and `score`. `tickRate` is the ticks added per second of chain time. Use the value read this round for every timing calculation. Do not assume it is 1. `score` is the `PlayerScore` integer for this wallet. Display score is that integer divided by 1000. Read it with the left-padded wallet, same as `PlayerJunk`.

Write the stored `tickNumber` into the snapshot field `tick`. Keep `tickRate`, `timestamp`, and `paused` from the same fixed-block read. When `paused` is false, compute `tickNumber + (block.timestamp - timestamp) * tickRate` off chain, with that round's `tickRate`. That sum is the tick a player call would settle to. When `tickRate` is above 0, a future tick is `(targetTick - that sum) / tickRate` seconds away. Apply due fleets and growth at the settle tick before choosing the call, using the combat and growth rules in [rules.md](rules.md). Leave the sum out of `tick`, and leave `planets/*.json` as the last written rows.

A stored `owner` of the zero address means the capture has not been written yet. When the off-chain settlement says this wallet will own the planet, send `df__addJunk` from this wallet. The call writes the elapsed ticks, which are the elapsed seconds times this round's `tickRate`, then settles the fleet, checks ownership, and registers the junk in that one transaction. Do the same for a move, an upgrade, or a withdraw: send it when the settled planet passes that call's check. The proof still has to match the coordinates and the biomebase. Do not wait for a later table read to show the new owner, and do not ask another wallet to tick first. A lone `df__tick` does not write the planet, so the next table read would still show the old owner. Use `df__tick` only as [actions.md](actions.md) says.

Planet state (owner, energy, silver, constants) is read for every hash in `discovered.json`. Fleet records are not. `PendingMove` is keyed by the destination hash, so a round reads it only for this set:

- every hash in `planets/owned.json`
- every `to` hash on a `move` line in `actions.ndjson`
- every hash in `planets/revealed.json`

Drop duplicate hashes. Do not add the rest of `discovered.json`. A mined planet that this wallet does not own, that it has not sent a fleet to, and that nobody has revealed, has no move read that round.

Read `PendingMove` for that set in one Multicall3 `aggregate3`. Read `Move` only where `number` is greater than 0, in a second `aggregate3`. If a call is rejected for size, split the same set into batches of 200. Do not drop a hash to make the call smaller, and do not send one `eth_call` per planet.

Order for the round: run the example below with `reveal`, rebuild the three planet files, then run it with `voyages`. The voyage half reads `owned.json`, so it runs after that file is rewritten.

Table ids:

- Planet `0x74626466000000000000000000000000506c616e657400000000000000000000`
- PlanetOwner `0x74626466000000000000000000000000506c616e65744f776e65720000000000`
- PlanetConstants `0x74626466000000000000000000000000506c616e6574436f6e7374616e747300`
- DFXStarConfig `0x7462646600000000000000000000000044465853746172436f6e666967000000`
- PlayerScore `0x74626466000000000000000000000000506c6179657253636f72650000000000`
- Ticker `0x746264660000000000000000000000005469636b657200000000000000000000`
- InnerCircle `0x74626466000000000000000000000000496e6e6572436972636c650000000000`
- RevealedPlanet `0x7462646600000000000000000000000052657665616c6564506c616e65740000`
- PendingMove `0x7462646600000000000000000000000050656e64696e674d6f76650000000000`
- Move `0x746264660000000000000000000000004d6f7665000000000000000000000000`
- PlanetJunkOwner `0x74626466000000000000000000000000506c616e65744a756e6b4f776e657200`
- PlanetAddJunkTick `0x74626466000000000000000000000000506c616e65744164644a756e6b546963`
- PlayerJunk `0x74626466000000000000000000000000506c617965724a756e6b000000000000`
- PlayerJunkLimit `0x74626466000000000000000000000000506c617965724a756e6b4c696d697400`
- SilverFrontier `0x7462646600000000000000000000000053696c76657246726f6e746965720000`

Planet, PlanetOwner, PlanetConstants, PlanetJunkOwner, PlanetAddJunkTick, and PendingMove use the planet hash as the key. PlayerJunk and PlayerJunkLimit use the left-padded wallet, same as PlayerScore. Junk owner is the first 20 bytes of that record. `addJunkTick`, used junk, and the junk limit are one `uint256` each. Move uses that destination hash plus the queue index. PlayerScore uses the left-padded wallet. The singleton tables use an empty key tuple. On the pool from [nutbox.md](nutbox.md), call `getTotalStakedAmount`, `getUserStakedAmount(player)`, and `getPendingAllRewards(player)`. Use the pool address in `DFXStarConfig`. Do not use the mainnet addresses in `df.config.toml`.

### Revealed coordinates

`RevealedPlanet` cannot be listed with `getRecord`, because that call needs the hash first. Other players publish coordinates this wallet never mined. Read the table by its logs.

`planets/revealed.block` is one decimal number: the first block not yet scanned. When the file is missing, start at block 0. Scan `Store_SetRecord` logs for this table through the latest block, merge them into the existing `revealed.json` by hash, and write the next block number. The same hash keeps the newer coordinates. Do not scan the `Move` table this way.

The log topic is `0x8dbb3a9672eebfd3773e72dd9c102393436816d832c7ba9e1e1ac8fcadcac7a9` (`Store_SetRecord(bytes32,bytes32[],bytes,bytes32,bytes)`). Topic two is the RevealedPlanet table id. Static data is packed from the left: `int32 x`, `int32 y`, `address revealer` (4 + 4 + 20 bytes). The key tuple's first word is the planet hash.

### Fleets

`PendingMove` static data is packed from the left: `uint8 head`, `uint8 number`, then 30 index bytes. When `number` is 0, or the record is empty, that destination has no fleet. Otherwise fleet `i` uses the index byte at `(head + i) % 30`, counting the first index byte as position 0. Read `Move` at key `(destination hash, that index)`. Its static data is packed from the left: `bytes32 from`, `uint64 id`, `address captain`, `uint64 departureTick`, `uint64 arrivalTick`, `uint64 population`, `uint64 silver`, `uint256 artifact`. There are at most 30 fleets on one destination.

Write one object per fleet:

```json
{
  "to": "<64 hex>",
  "from": "<64 hex>",
  "index": 0,
  "id": "1",
  "captain": "0xabc",
  "departureTick": 0,
  "arrivalTick": 10,
  "population": "1000",
  "silver": "0",
  "artifact": "0"
}
```

`population` and `silver` stay in chain units. `captain` is the fleet's owner. A captain other than this wallet, with `to` in `owned.json`, is an inbound fleet. A `to` taken from `actions.ndjson` is a fleet this wallet already sent. Leave those fleets in flight when the strategy changes.

### Example

The repository does not contain this reader. Save the example as a temporary file and run it with Node. Do not commit it. Replace `WALLET` if this session's wallet folder is different. Run `reveal` before rebuilding the planet files, and `voyages` after `owned.json` is rewritten.

```bash
node /tmp/darkforest-round-read.mjs reveal
node /tmp/darkforest-round-read.mjs voyages
```

```js
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const PHASE = process.argv[2]; // reveal | voyages
const WALLET =
  "/Volumes/Extreme Pro/wangxi/study/mud-study/31337-0xfdf868ea710ffd8cd33b829c5aff79edd15ecd5f-1/0x2ee03331a6e02c9f90e6d558fd0e48e016746acc";
const RPC = "http://127.0.0.1:8545";
const WORLD = "0xfDf868Ea710FfD8cd33b829c5AFf79eDd15EcD5f";
const MULTI = "0xcA11bde05977b3631167028862bE2a173976CA11";
const SET_RECORD =
  "0x8dbb3a9672eebfd3773e72dd9c102393436816d832c7ba9e1e1ac8fcadcac7a9";
const REVEALED =
  "0x7462646600000000000000000000000052657665616c6564506c616e65740000";
const PENDING =
  "0x7462646600000000000000000000000050656e64696e674d6f76650000000000";
const MOVE =
  "0x746264660000000000000000000000004d6f7665000000000000000000000000";

const word = (hex) => hex.replace(/^0x/, "").toLowerCase().padStart(64, "0");
const hexOf = (buffer) => buffer.toString("hex");

async function rpc(method, params) {
  const response = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await response.json();
  if (body.error) {
    throw new Error(body.error.message);
  }
  return body.result;
}

function u256(buffer, offset) {
  return BigInt("0x" + hexOf(buffer.subarray(offset, offset + 32)));
}

function encodeGetRecord(tableId, keys) {
  let body = word(tableId) + word("40") + word(keys.length.toString(16));
  for (const key of keys) {
    body += word(key);
  }
  return "0xcc49db7e" + body;
}

function encodeTuple(call) {
  const data = call.data.replace(/^0x/, "");
  const pad = data.length % 64 === 0 ? 0 : 64 - (data.length % 64);
  // Bytes offset 0x60 is the three head words of (address, bool, bytes).
  return (
    word(call.to) +
    word("0") +
    word("60") +
    word((data.length / 2).toString(16)) +
    data +
    "0".repeat(pad)
  );
}

function encodeAggregate(calls) {
  // Offsets are measured from the first offset word, after the array length.
  const tuples = calls.map(encodeTuple);
  let cursor = calls.length * 32;
  const offsets = [];
  for (const tuple of tuples) {
    offsets.push(word(cursor.toString(16)));
    cursor += tuple.length / 2;
  }
  return (
    "0x82ad56cb" +
    word("20") +
    word(calls.length.toString(16)) +
    offsets.join("") +
    tuples.join("")
  );
}

function decodeAggregate(hex) {
  const buffer = Buffer.from(hex.replace(/^0x/, ""), "hex");
  const arrayAt = Number(u256(buffer, 0));
  const count = Number(u256(buffer, arrayAt));
  const rows = [];
  for (let index = 0; index < count; index += 1) {
    const tupleAt = arrayAt + Number(u256(buffer, arrayAt + 32 + index * 32));
    const bytesAt = tupleAt + Number(u256(buffer, tupleAt + 64));
    const length = Number(u256(buffer, bytesAt));
    rows.push(buffer.subarray(bytesAt + 32, bytesAt + 32 + length));
  }
  return rows;
}

function staticData(record) {
  const start = Number(u256(record, 0));
  const length = Number(u256(record, start));
  return record.subarray(start + 32, start + 32 + length);
}

function signed32(buffer, offset) {
  const value = buffer.readInt32BE(offset);
  return value;
}

async function reveal() {
  const blockFile = path.join(WALLET, "planets", "revealed.block");
  const outFile = path.join(WALLET, "planets", "revealed.json");
  let fromBlock = 0;
  const known = new Map();
  try {
    fromBlock = Number(await readFile(blockFile, "utf8"));
  } catch {
    // First round scans from block 0.
  }
  try {
    for (const row of JSON.parse(await readFile(outFile, "utf8"))) {
      known.set(row.hash, row);
    }
  } catch {
    // No reveal file yet.
  }
  const latest = Number(await rpc("eth_blockNumber", []));
  if (fromBlock <= latest) {
    const logs = await rpc("eth_getLogs", [
      {
        address: WORLD,
        fromBlock: "0x" + fromBlock.toString(16),
        toBlock: "0x" + latest.toString(16),
        topics: [SET_RECORD, REVEALED],
      },
    ]);
    const readAt = new Date().toISOString();
    for (const log of logs) {
      const data = Buffer.from(log.data.replace(/^0x/, ""), "hex");
      const keyAt = Number(u256(data, 0));
      // keyTuple is a length word, then the planet hash.
      const hash = hexOf(data.subarray(keyAt + 32, keyAt + 64));
      const staticAt = Number(u256(data, 32));
      const staticLength = Number(u256(data, staticAt));
      const packed = data.subarray(staticAt + 32, staticAt + 32 + staticLength);
      if (packed.length !== 28) {
        continue;
      }
      known.set(hash, {
        hash,
        x: signed32(packed, 0),
        y: signed32(packed, 4),
        revealer: "0x" + hexOf(packed.subarray(8, 28)),
        readAt,
      });
    }
  }
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, JSON.stringify([...known.values()], null, 2));
  await writeFile(blockFile, String(latest + 1));
}

function hashWord(hash) {
  return word(hash.replace(/^0x/, ""));
}

async function readJson(name, fallback) {
  try {
    return JSON.parse(await readFile(path.join(WALLET, name), "utf8"));
  } catch {
    return fallback;
  }
}

async function voyages() {
  const owned = await readJson("planets/owned.json", []);
  const revealed = await readJson("planets/revealed.json", []);
  let actionText = "";
  try {
    actionText = await readFile(path.join(WALLET, "actions.ndjson"), "utf8");
  } catch {
    // No moves sent yet.
  }
  const destinations = new Set();
  for (const planet of owned) {
    destinations.add(planet.hash.replace(/^0x/, "").toLowerCase());
  }
  for (const planet of revealed) {
    destinations.add(planet.hash.replace(/^0x/, "").toLowerCase());
  }
  const lines = actionText.split("\n");
  for (const line of lines) {
    if (!line) {
      continue;
    }
    const action = JSON.parse(line);
    if (action.action === "move" && action.to) {
      destinations.add(String(action.to).replace(/^0x/, "").toLowerCase());
    }
  }
  const hashes = [...destinations];
  const fleets = [];
  for (let start = 0; start < hashes.length; start += 200) {
    const batch = hashes.slice(start, start + 200);
    const pendingHex = await rpc("eth_call", [
      {
        to: MULTI,
        data: encodeAggregate(
          batch.map((hash) => ({
            to: WORLD,
            data: encodeGetRecord(PENDING, [hashWord(hash)]),
          })),
        ),
      },
      "latest",
    ]);
    const pendingRows = decodeAggregate(pendingHex);
    const moveCalls = [];
    for (let index = 0; index < batch.length; index += 1) {
      const packed = staticData(pendingRows[index]);
      if (packed.length < 32 || packed[1] === 0) {
        continue;
      }
      const head = packed[0];
      const number = Math.min(packed[1], 30);
      for (let fleet = 0; fleet < number; fleet += 1) {
        const moveIndex = packed[2 + ((head + fleet) % 30)];
        moveCalls.push({ to: batch[index], index: moveIndex });
      }
    }
    if (moveCalls.length === 0) {
      continue;
    }
    const moveHex = await rpc("eth_call", [
      {
        to: MULTI,
        data: encodeAggregate(
          moveCalls.map((call) => ({
            to: WORLD,
            data: encodeGetRecord(MOVE, [
              hashWord(call.to),
              word(call.index.toString(16)),
            ]),
          })),
        ),
      },
      "latest",
    ]);
    const moveRows = decodeAggregate(moveHex);
    for (let index = 0; index < moveCalls.length; index += 1) {
      const packed = staticData(moveRows[index]);
      if (packed.length < 124) {
        continue;
      }
      const read64 = (offset) => packed.readBigUInt64BE(offset).toString();
      fleets.push({
        to: moveCalls[index].to,
        from: hexOf(packed.subarray(0, 32)),
        index: moveCalls[index].index,
        id: read64(32),
        captain: "0x" + hexOf(packed.subarray(40, 60)),
        departureTick: Number(read64(60)),
        arrivalTick: Number(read64(68)),
        population: read64(76),
        silver: read64(84),
        artifact: BigInt("0x" + hexOf(packed.subarray(92, 124))).toString(),
      });
    }
  }
  await writeFile(
    path.join(WALLET, "voyages.json"),
    JSON.stringify(fleets, null, 2),
  );
}

if (PHASE === "reveal") {
  await reveal();
} else if (PHASE === "voyages") {
  await voyages();
} else {
  throw new Error("pass reveal or voyages");
}
```

## Junk quota

Space junk is enabled. Spawn sets the planet owner and this wallet's junk limit to 1000. It leaves the junk owner at the zero address, and used junk at 0.

Used junk is the sum of `junkCost` on planets whose junk owner is this wallet. Registering reverts when used junk plus the next cost would pass the limit. Read `junkUsed` and `junkLimit` from the snapshot, and `junkOwner` on each planet, before choosing.

Move, upgrade, withdraw, and buy silver revert while a planet's owner and junk owner differ. A capture changes the owner and leaves the junk owner in place. The previous wallet keeps that cost in its used junk until this wallet registers the planet or the previous wallet clears it. Energy and silver grow only while the two owners match and the ticker is advancing.

`add-junk` and `clear-junk` are ordinary play actions. Clearing a planet this wallet still owns also abandons it. The limit can be raised. `buy-junk` sets a new allocation from 2 through 1000, and the stored limit becomes that allocation times 1000. It spends ETH, so ask the owner before the first purchase. The calls are in [actions.md](actions.md).

## Funds

Before the first spend of AIPRO, ask the owner for the maximum whole-token amount this wallet may spend. Write `funds.json`:

```json
{ "token": "AIPRO", "cap": "0", "spent": "0", "remaining": "0" }
```

Use the owner's number for `cap` and `remaining`. Each spend appends `spends.ndjson` with `time`, `strategy` (the filename), `use`, `amount`, `tx`, `spent`, and `remaining`, then updates `funds.json`. When the owner asks about funds, answer from `funds.json`, `spends.ndjson`, and the token balance.

## Price

`price.json` is the AIPRO price hook:

```json
{ "token": "AIPRO", "source": null, "price": null, "quotedAt": null }
```

Leave `source` null until a trading pool is added. Do not invent a price.

## Action log

Append one JSON line to `actions.ndjson` after each receipt:

```json
{
  "time": "2026-11-05T06:00:00Z",
  "strategy": "aggressive.md",
  "action": "buy-silver",
  "detail": "tier 0 on a level-1 planet",
  "tx": "0x"
}
```

A move line also has `"to":"<64 hex>"`. `strategy` is always the filename from `strategy.txt` for that action. The time key is `time`. A line that uses `at` instead is the same moment, and the page shows it, but new lines use `time`. `df__tick` is not the way to wait out a voyage. The rule for that call is in [actions.md](actions.md).
