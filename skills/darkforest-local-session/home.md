# Home planet

A joined wallet still cannot play until it has a home. Buying a pass and `joinSeason` do not create one. A home exists when `SpawnPlanet` for this wallet is not zero and `homeLocations.json` contains that planet hash.

Do this before [mining.md](mining.md). Do not mine from `0, 0`. The center of the map is inside the inner circle, and a home there is rejected.

## Read the chain

Use the world `0xfDf868Ea710FfD8cd33b829c5AFf79eDd15EcD5f` and the test Multicall3 `0xcA11bde05977b3631167028862bE2a173976CA11` from `SKILL.md`. Set both `NO_PROXY=127.0.0.1,localhost` and `no_proxy=127.0.0.1,localhost`. Read these three tables in one `aggregate3`. Do not send a separate `eth_call` for each table. `allowFailure` is false. Do not send ETH to Multicall3.

| Table       | Id                                                                   |
| ----------- | -------------------------------------------------------------------- |
| SpawnPlanet | `0x74626466000000000000000000000000537061776e506c616e65740000000000` |
| Player      | `0x74626466000000000000000000000000506c6179657200000000000000000000` |
| InnerCircle | `0x74626466000000000000000000000000496e6e6572436972636c650000000000` |

`<key>` is the player address padded on the left to 32 bytes. `cast to-bytes32` pads on the right and is the wrong key. Use:

```bash
cast abi-encode "x(address)" <player>
```

```bash
export NO_PROXY=127.0.0.1,localhost
export no_proxy=127.0.0.1,localhost
RPC=http://127.0.0.1:8545
MULTI=0xcA11bde05977b3631167028862bE2a173976CA11
WORLD=0xfDf868Ea710FfD8cd33b829c5AFf79eDd15EcD5f
KEY=$(cast abi-encode "x(address)" <player>)
SPAWN=$(cast calldata "getRecord(bytes32,bytes32[])" 0x74626466000000000000000000000000537061776e506c616e65740000000000 "[$KEY]")
PLAYER_REC=$(cast calldata "getRecord(bytes32,bytes32[])" 0x74626466000000000000000000000000506c6179657200000000000000000000 "[$KEY]")
CIRCLE=$(cast calldata "getRecord(bytes32,bytes32[])" 0x74626466000000000000000000000000496e6e6572436972636c650000000000 "[]")

cast call $MULTI \
  "aggregate3((address,bool,bytes)[])((bool,bytes)[])" \
  "[($WORLD,false,$SPAWN),($WORLD,false,$PLAYER_REC),($WORLD,false,$CIRCLE)]" \
  --rpc-url $RPC
```

The three results are SpawnPlanet, Player, then InnerCircle. Each `returnData` is the ABI encoding of `getRecord`: static bytes, one length word, then dynamic bytes.

- SpawnPlanet static data is one `uint256`. Zero means this wallet has no home. Any other value is the home planet hash. Do not call `initializePlayer` again.
- Player static data is the burner address (20 bytes), then the player index (`uint32`), then `createdAt` (`uint64`), all big-endian and packed from the left. An empty record, or an index of zero, means the wallet is not registered. Spawn reverts until it is registered.
- InnerCircle static data is three `uint64` values: `radius`, `radiusx1000`, `speed`. The first value is the live inner radius. It starts at `75000`.

## What counts as a home

The contract, not the map center, decides. A coordinate is a legal home only when every line below is true. These numbers are the values deployed from `packages/contracts/df.config.toml`.

- It is a planet: its MiMC hash, key `1729`, is below `LOCATION_ID_UB / 16384`.
- Let `distanceSquare` be `x * x + y * y`. It is at least `75000 * 75000`, and at least `innerRadius * innerRadius`. It is below `100000 * 100000`.
- Zone comes from the borders `[37500, 50000, 62500, 75000, 87500]`. Walk them in order and take the first border whose square is strictly greater than `distanceSquare`. If none matches, the zone is `5`. Zone `4` is the band above `75000` through `87500`.
- Space Perlin uses key `1730`, scale `8192`, neither axis mirrored, `floor` true. Spawn Perlin must be at least `1` and below `31`. Zone `4` is always nebula. Zone `5` is nebula only when that Perlin is below `14`. Any other zone is not a home, even when the inner circle has shrunk.
- Level is the lowest 24 bits of the planet hash. The level thresholds are `[100, 500, 4000, 8000, 30000, 65520, 262128, 1048561, 4194292]`. When the 24-bit value is below one of them, the level is not zero. A home needs that value to be at least `4194292`, so the level stays `0`. Zone `4` and zone `5` add no level bonus.
- A level-0 nebula planet is type planet. The type byte does not need a separate test.

The search center is `(80000, 0)`. That point sits in zone `4`. Spiral outward from there with `SpiralPattern` from `MiningPatterns.ts`. Do not start at `(0, 0)`.

Skip a chunk when its nearest corner is inside the inner radius or outside the world, using the same nearest-corner test as [mining.md](mining.md). Inside a chunk that is kept, test each coordinate. Take the first coordinate that passes. One home is enough.

## Create the home, then ask about mining

Finding the coordinate does not spend tokens. As soon as one legal coordinate is known, stop the search and create the home. Do not ask whether to use that coordinate. Use the last 6 hex characters of the wallet in the name `pilot<those 6 characters>`. The burner is the same wallet. Do not create or store a second key.

If the ETH balance cannot pay for the register and spawn transactions, stop and tell the owner. Do not search further and do not write the home files.

Sign with the current wallet. A legacy transaction is fine. Wait for each receipt. Call the world, not the pass contract.

1. If the player index is zero, call `df__registerPlayer(string,address)` with the name and the player address. If it reverts because the name is taken, append a number and send again. Do not stop to ask. If it reverts because the wallet is already registered, continue.
2. Prove the candidate with the example below. This proof is required. `b_skip_proof_check` is false on this session.
3. Call `df__initializePlayer(uint256[2],uint256[2][2],uint256[2],uint256[9])` with the `a`, `b`, `c`, and nine public signals printed by the example.

If spawn reverts because that planet is already owned, or because it is not a legal home, discard that coordinate and search again from the next chunk. Do not retry the same coordinate. If it reverts because this wallet already spawned, stop. If it reverts because the game pass is missing, return to the join step in `SKILL.md`.

After the spawn receipt succeeds, write the wallet folder's `homeLocations.json`. The hash is 64 lowercase hex characters and has no `0x` prefix. `perlin` is the space Perlin. `biomebase` uses key `1731` and `floor` true.

```json
[
  {
    "coords": { "x": 80012, "y": 3 },
    "hash": "<64 hex characters>",
    "perlin": 12,
    "biomebase": 9
  }
]
```

Also append the chunk that contains this planet as one line of `knownBoard.ndjson`, and write `homeLocations.json` after the receipt. Read `SpawnPlanet` again. The home is ready only when that value is not zero, `homeLocations.json` exists, and that chunk line is in the log. Then follow the first-ring steps in [mining.md](mining.md). Do not ask about mining, and do not ask whether the home itself is acceptable, until that ring is written.

## Example

The repository does not contain a home-search script. Write this to a temporary file, set `WALLET` and `INNER_RADIUS`, and run it from `packages/client`. Do not commit the temporary file. It only searches and proves. It does not send a transaction.

```bash
cd packages/client
./node_modules/.bin/tsx /tmp/darkforest-home.ts
```

```ts
import { readFileSync } from "node:fs";
import { appendFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { Worker } from "node:worker_threads";
import bigInt from "big-integer";
import { SpiralPattern } from "./src/Backend/Miner/MiningPatterns.ts";
import { mimcHash, modPBigInt, perlin } from "./src/Shared/hashing/index.ts";

const WALLET = "0x2ee03331a6e02c9f90e6d558fd0e48e016746acc";
const INNER_RADIUS = 75000; // Live InnerCircle radius. The spawn ring is still outside 75000.
const SEARCH_X = 80000;
const SEARCH_Y = 0;

const CHUNK_SIZE = 16;
const WORLD_RADIUS = 100000;
const SPAWN_RING = 75000;
const BORDERS = [37500, 50000, 62500, 75000, 87500];
const LEVEL_FLOOR = 4194292;
const LOCATION_ID_UB = bigInt(
  "21888242871839275222246405745257275088548364400416034343698204186575808495617",
);
const spaceFloor = {
  key: 1730,
  scale: 8192,
  mirrorX: false,
  mirrorY: false,
  floor: true,
};
const biomeFloor = { ...spaceFloor, key: 1731 };

function nearestSquare(x: number, y: number, side: number): number {
  const xMin = Math.abs(x + side / 2) - side / 2;
  const yMin = Math.abs(y + side / 2) - side / 2;
  return xMin ** 2 + yMin ** 2;
}

function zoneOf(distanceSquare: number): number {
  for (let i = 0; i < BORDERS.length; i += 1) {
    if (distanceSquare < BORDERS[i] * BORDERS[i]) return i;
  }
  return BORDERS.length;
}

// Load the browser prover that already ships with the client.
const context: Record<string, unknown> = {
  console,
  setTimeout,
  clearTimeout,
  setImmediate,
  clearImmediate,
  Buffer,
  process,
  URL,
  TextEncoder,
  TextDecoder,
  Worker,
  btoa,
  atob,
  performance,
  queueMicrotask,
};
context.global = context;
context.self = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(readFileSync("public/snarkjs.min.js", "utf8"), context, {
  filename: "snarkjs.min.js",
});
const snarkjs = context.snarkjs as {
  groth16: {
    fullProve: (
      input: Record<string, string>,
      wasm: Uint8Array,
      zkey: Uint8Array,
    ) => Promise<{
      proof: { pi_a: string[]; pi_b: string[][]; pi_c: string[] };
      publicSignals: string[];
    }>;
  };
};

const planetHash = mimcHash(1729);
const pattern = new SpiralPattern({ x: SEARCH_X, y: SEARCH_Y }, CHUNK_SIZE);
let footprint = pattern.fromChunk;
let home: {
  x: number;
  y: number;
  h: string;
  p: number;
  b: number;
} | null = null;

while (!home) {
  const corner = nearestSquare(
    footprint.bottomLeft.x,
    footprint.bottomLeft.y,
    footprint.sideLength,
  );
  const outside = corner < INNER_RADIUS ** 2 || corner >= WORLD_RADIUS ** 2;
  if (!outside) {
    for (
      let x = footprint.bottomLeft.x;
      x < footprint.bottomLeft.x + CHUNK_SIZE;
      x += 1
    ) {
      for (
        let y = footprint.bottomLeft.y;
        y < footprint.bottomLeft.y + CHUNK_SIZE;
        y += 1
      ) {
        const distanceSquare = x * x + y * y;
        if (
          distanceSquare < SPAWN_RING * SPAWN_RING ||
          distanceSquare < INNER_RADIUS * INNER_RADIUS ||
          distanceSquare >= WORLD_RADIUS * WORLD_RADIUS
        ) {
          continue;
        }
        const hash = planetHash(x, y);
        if (!hash.lesser(LOCATION_ID_UB.divide(16384))) continue;
        if (Number(BigInt(hash.toString()) & 0xffffffn) < LEVEL_FLOOR) continue;
        const p = perlin({ x, y }, spaceFloor);
        if (p < 1 || p >= 31) continue;
        const zone = zoneOf(distanceSquare);
        const nebula = zone === 4 || (zone === 5 && p < 14);
        if (!nebula) continue;
        home = {
          x,
          y,
          h: hash.toString(16).padStart(64, "0"),
          p,
          b: perlin({ x, y }, biomeFloor),
        };
        break;
      }
      if (home) break;
    }
  }
  if (!home) footprint = pattern.nextChunk(footprint);
}

const boardLog = path.join(
  "/Volumes/Extreme Pro/wangxi/study/mud-study",
  "31337-0xfdf868ea710ffd8cd33b829c5aff79edd15ecd5f-1",
  WALLET.toLowerCase(),
  "knownBoard.ndjson",
);
const chunkX = Math.floor(home.x / CHUNK_SIZE) * CHUNK_SIZE;
const chunkY = Math.floor(home.y / CHUNK_SIZE) * CHUNK_SIZE;
const chunkBody = {
  x: chunkX,
  y: chunkY,
  s: CHUNK_SIZE,
  l: [home],
  p: perlin(
    { x: chunkX + CHUNK_SIZE / 2, y: chunkY + CHUNK_SIZE / 2 },
    { ...spaceFloor, floor: false },
  ),
};
await appendFile(boardLog, `${JSON.stringify(chunkBody)}\n`);

const distance = Math.hypot(home.x, home.y);
const input = {
  x: modPBigInt(home.x).toString(),
  y: modPBigInt(home.y).toString(),
  r: String(Math.floor(distance) + 1),
  PLANETHASH_KEY: "1729",
  SPACETYPE_KEY: "1730",
  SCALE: "8192",
  xMirror: "0",
  yMirror: "0",
  targetDistFromOriginSquare: String(home.x * home.x + home.y * home.y),
};
const proved = await snarkjs.groth16.fullProve(
  input,
  readFileSync("src/Shared/snarks/init.wasm"),
  readFileSync("src/Shared/snarks/init.zkey"),
);

// The contract expects the two inner pairs of pi_b reversed.
const call = {
  a: proved.proof.pi_a.slice(0, 2),
  b: [
    proved.proof.pi_b[0].slice(0).reverse(),
    proved.proof.pi_b[1].slice(0).reverse(),
  ],
  c: proved.proof.pi_c.slice(0, 2),
  input: proved.publicSignals,
  home,
};
console.log(JSON.stringify(call));
```

Do not write `homeLocations.json` from this example. Write it only after the spawn receipt succeeds. Then tell the owner the coordinates, the name that was registered, and the wallet folder.
