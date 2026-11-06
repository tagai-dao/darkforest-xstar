# Mining

Mine only after the wallet has joined and a home planet is saved in `homeLocations.json`. The center is that planet. Finding the home is [home.md](home.md). Moving fleets is not part of this file.

The repository does not contain a mining script. Write the example below to a temporary file, fill in the owner's choices, and run it. Do not commit that temporary file.

## First ring, then the page, then the question

The home chunk is the side-16 square that contains the home. Its bottom-left corner is `floor(x / 16) * 16`, `floor(y / 16) * 16`. The first ring is that chunk plus the eight side-16 chunks that touch it by a side or a corner. Offsets from the home chunk are `-16`, `0`, and `16` on each axis, except `0, 0`, which is the home chunk itself.

As soon as the home files exist, mine this ring. Do not ask first. Skip a chunk inside the inner circle or outside the world, using the nearest-corner test later in this file. Skip a side-16 square that is already inside a chunk in `knownBoard.ndjson`. After each finished square, fold it into that file with the merge below before starting the next one.

When the first chunk of this ring starts, tell the owner three things in their language, before the mining question:

1. Open `http://localhost:3000/redpill/0xfDf868Ea710FfD8cd33b829c5AFf79eDd15EcD5f`.
2. The folder to import is the wallet folder. For this session that is `/Volumes/Extreme Pro/wangxi/study/mud-study/31337-0xfdf868ea710ffd8cd33b829c5aff79edd15ecd5f-<season>/<wallet lowercase>`.
3. On the page, click `打开钱包目录` and select that wallet folder. It must contain `agent.json` directly. The season folder above it is the wrong folder. The owner does not select the folder a second time.

Example:

> The home is at (79942, 62), registered as pilot746acc. Open http://localhost:3000/redpill/0xfDf868Ea710FfD8cd33b829c5AFf79eDd15EcD5f and click 打开钱包目录. Select /Volumes/Extreme Pro/wangxi/study/mud-study/31337-0xfdf868ea710ffd8cd33b829c5aff79edd15ecd5f-1/0x2ee03331a6e02c9f90e6d558fd0e48e016746acc.

After the ring is on disk, ask once, in the owner's language, and include the default and the other choices in that same question. Wait for the choice. Then continue mining from the home with that choice. Do not ask the owner to confirm the home, and do not ask them to fill in a form before they have chosen. If they have not opened the page yet, repeat the address and the folder path once with the mining question.

Default:

| Choice  | Default                                                    |
| ------- | ---------------------------------------------------------- |
| Pattern | `spiral`, rings outward                                    |
| Cores   | `1`                                                        |
| Center  | The home planet in `homeLocations.json`. Do not use `0 0`. |
| Chunks  | `0`, keep mining until the owner says stop                 |
| Minutes | `0`, no time limit                                         |

Other choices, offered in the same question:

| Choice  | Options                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------ |
| Pattern | `swiss` skips every other chunk. `center` moves toward the map center. `center2` is a straighter band toward the center. |
| Cores   | `2`, `4`, `8`, `16`, or `32`                                                                                             |
| Center  | A coordinate outside the inner circle. The home remains the default.                                                     |
| Chunks  | A positive count. Each chunk is 16 by 16 coordinates.                                                                    |
| Minutes | A duration. `60` is one hour. Mining stops when the time is up, even if the chunk count is not finished.                 |

Chunks and minutes can both be set. Stop at whichever limit is reached first. `0` on either one means that limit is unused. The default leaves both at `0` and runs until the owner says stop.

Example:

> The home is at (79942, 62). Start mining? The default is one core, spiraling outward from that home, until you say stop. You can instead pick a pattern (swiss, center, or center2), a core count (2, 4, 8, 16, or 32), another center outside the inner circle, a fixed number of chunks, or a duration such as 60 minutes.

A yes, or words such as "default" or "start", means the default row. If the owner names some of the other choices, use those and keep the default for anything they left out. "One hour" means `MINUTES = 60`. If the center they name is inside the inner circle, say so and wait for another center. Do not start with an illegal center.

After the choice is clear, run the example below with those values. Do not ask a second time. Do not ask about the chain or the contracts again.

## What mining does

Mining takes one 16 by 16 square at a time from the pattern and hashes every coordinate with MiMC. A coordinate is a planet when its hash is below `LOCATION_ID_UB / 16384`. The page draws the chunks in `knownBoard.ndjson` as they are stored. Fold each finished square into that file before the next one starts.

The numbers match what `packages/contracts/df.config.toml` deployed on this chain:

- Planet rarity `16384` (`[universe] a_sparsity`)
- Planet hash key `1729`
- Biome base key `1731`
- Space type key `1730`
- Perlin scale `8192`, with neither axis mirrored
- Chunk side `16`

The four patterns are the classes used by `ExplorePane`, in `packages/client/src/Backend/Miner/MiningPatterns.ts`. The hash functions are `mimcHash` and `perlin` in `packages/client/src/Shared/hashing`. Do not write a different hash. The planets would not match the chain.

Cores split a chunk the same way as `miner.worker.ts`: core `i` hashes coordinates where `count % cores === i`, then the results are merged. The example below is one process and still hashes every coordinate in the chunk, so the result matches a merged multi-core run. If the owner picks more cores, split the coordinates by that remainder and do not skip any.

Skip a side-16 square that sits inside a chunk already in `knownBoard.ndjson`, and continue with the pattern's next square. A stored chunk covers a square when that square's bottom-left lies inside it. Read the file once at the start and fold any four aligned siblings before hashing. Also skip a chunk inside the inner circle or outside the world. Take the chunk center, subtract half the side from the absolute value of each axis, and square-sum those two numbers. That is the squared distance from the origin to the chunk's nearest corner. Skip the chunk when that distance is below the live inner-circle radius, or when it is at or beyond the world radius `100000`. The inner circle starts at `75000` and shrinks. Read it the same way as [home.md](home.md). Do not hash a chunk inside the inner circle. Fleets cannot enter it.

Four stored chunks of the same side whose bottom-left corners are `2 * side` apart become one chunk of double that side. The new bottom-left is the minimum of the four. Planets are the four lists joined. Perlin is the average of the four, then kept to three decimal places. Repeat while the new chunk still has three siblings, and stop at side `16384`. This is the same fold as `addToChunkMap` in `packages/client/src/Backend/Miner/ChunkUtils.ts`.

When the fold removes siblings, write the whole map back to `knownBoard.ndjson`: one JSON line per chunk that remains, then a trailing newline. Write that text to `knownBoard.ndjson.tmp` in the same folder and rename it over the log. A new square that does not merge is one appended line. Lines that were not part of the fold stay as they are. If a previous run is still hashing around `0, 0`, stop that process before rewriting the log.

The log is one file in the wallet folder:

`/Volumes/Extreme Pro/wangxi/study/mud-study/31337-0xfdf868ea710ffd8cd33b829c5aff79edd15ecd5f-<season>/<wallet lowercase>/knownBoard.ndjson`

Do not write a directory of chunk files, and do not write under `~/Library`. The owner does not select the folder again.

Each line has this shape:

```json
{
  "x": 0,
  "y": 0,
  "s": 16,
  "l": [
    { "x": 1, "y": 2, "h": "<64 hex characters, no 0x prefix>", "p": 0, "b": 0 }
  ],
  "p": 0
}
```

`l` is the planets in that chunk and may be an empty array. `p` on the chunk is the space Perlin at the chunk center, computed with `floor` false. `p` and `b` on a planet are computed with `floor` true.

When running under Node, `BigInteger` in `packages/client/src/Shared/hashing/fractions/bigFraction.ts` must be `import type`. It is only used as a type. A value import makes Node report that the package has no `BigInteger` export.

## Example

Save the example as a temporary file and run it from `packages/client`. Replace `PATTERN`, `CORES`, `CHUNKS`, `MINUTES`, `CENTER_X`, `CENTER_Y`, and `WALLET` with the owner's choices. For one hour, set `MINUTES` to `60` and leave `CHUNKS` at `0`.

```bash
cd packages/client
./node_modules/.bin/tsx /tmp/darkforest-mine.ts
```

```ts
import { appendFile, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import bigInt from "big-integer";
import {
  SpiralPattern,
  SwissCheesePattern,
  TowardsCenterPattern,
  TowardsCenterPatternV2,
} from "./src/Backend/Miner/MiningPatterns.ts";
import { mimcHash, perlin } from "./src/Shared/hashing/index.ts";

// Default setup. Replace these only when the owner asked for a custom setup.
const PATTERN = "spiral"; // spiral | swiss | center | center2
const CORES = 1; // 1 | 2 | 4 | 8 | 16 | 32. This example is one process and still hashes every coordinate.
const CHUNKS = 0; // 0 means no chunk limit. Stop earlier when MINUTES is also set.
const MINUTES = 0; // 0 means no time limit. 60 means stop after one hour.
const CENTER_X = 0; // Replace with the home planet x from homeLocations.json.
const CENTER_Y = 0; // Replace with the home planet y. Do not leave these at 0.
const WALLET = "0x2ee03331a6e02c9f90e6d558fd0e48e016746acc";

const PLANET_RARITY = 16384;
const CHUNK_SIZE = 16;
const MAX_SIDE = 16384;
const WORLD_RADIUS = 100000;
const INNER_RADIUS = 75000; // Replace with the live InnerCircle radius.
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

const patterns = {
  spiral: SpiralPattern,
  swiss: SwissCheesePattern,
  center: TowardsCenterPattern,
  center2: TowardsCenterPatternV2,
};

function locationId(value: ReturnType<typeof bigInt>): string {
  return value.toString(16).padStart(64, "0");
}

// Same split as miner.worker.ts. Pass cores as totalWorkers. This single process uses 1.
function exploreChunk(
  bottomLeftX: number,
  bottomLeftY: number,
  sideLength: number,
  workerIndex: number,
  totalWorkers: number,
) {
  const planetHash = mimcHash(1729);
  const rarity = bigInt(PLANET_RARITY);
  const hits = [];
  let count = 0;
  for (let x = bottomLeftX; x < bottomLeftX + sideLength; x += 1) {
    for (let y = bottomLeftY; y < bottomLeftY + sideLength; y += 1) {
      if (count % totalWorkers === workerIndex) {
        const hash = planetHash(x, y);
        if (hash.lesser(LOCATION_ID_UB.divide(rarity))) {
          hits.push({
            x,
            y,
            h: locationId(hash),
            p: perlin({ x, y }, spaceFloor),
            b: perlin({ x, y }, biomeFloor),
          });
        }
      }
      count += 1;
    }
  }
  return hits;
}

const wallet = WALLET.toLowerCase();
const boardLog = path.join(
  "/Volumes/Extreme Pro/wangxi/study/mud-study",
  "31337-0xfdf868ea710ffd8cd33b829c5aff79edd15ecd5f-1",
  wallet,
  "knownBoard.ndjson",
);
type BoardChunk = {
  x: number;
  y: number;
  s: number;
  l: { x: number; y: number; h: string; p: number; b: number }[];
  p: number;
};

function boardKey(chunk: { x: number; y: number; s: number }): string {
  return `${chunk.x},${chunk.y},${chunk.s}`;
}

function covered(x: number, y: number, s: number): boolean {
  let side = s;
  while (side <= MAX_SIDE) {
    const cx = Math.floor(x / side) * side;
    const cy = Math.floor(y / side) * side;
    if (board.has(`${cx},${cy},${side}`)) return true;
    side *= 2;
  }
  return false;
}

// Four aligned siblings become one chunk, up to side 16384.
function addMined(chunk: BoardChunk): "skip" | "append" | "rewrite" {
  if (covered(chunk.x, chunk.y, chunk.s)) return "skip";
  let current = chunk;
  let merged = false;
  while (current.s < MAX_SIDE) {
    const double = current.s * 2;
    const x0 = Math.floor(current.x / double) * double;
    const y0 = Math.floor(current.y / double) * double;
    const siblings: BoardChunk[] = [];
    for (let i = 0; i < 2; i += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = x0 + i * current.s;
        const y = y0 + j * current.s;
        if (x === current.x && y === current.y) continue;
        const sibling = board.get(`${x},${y},${current.s}`);
        if (!sibling) return place(current, merged);
        siblings.push(sibling);
      }
    }
    for (const sibling of siblings) board.delete(boardKey(sibling));
    let perlinSum = current.p / 4;
    const planets = [...current.l];
    for (const sibling of siblings) {
      perlinSum += sibling.p / 4;
      planets.push(...sibling.l);
    }
    current = {
      x: x0,
      y: y0,
      s: double,
      l: planets,
      p: Math.floor(perlinSum * 1000) / 1000,
    };
    merged = true;
  }
  return place(current, merged);
}

function place(chunk: BoardChunk, merged: boolean): "append" | "rewrite" {
  board.set(boardKey(chunk), chunk);
  return merged ? "rewrite" : "append";
}

async function writeBoard() {
  const lines = [...board.values()].map((chunk) => JSON.stringify(chunk));
  const text = lines.length === 0 ? "" : `${lines.join("\n")}\n`;
  const temporary = `${boardLog}.tmp`;
  await writeFile(temporary, text);
  await rename(temporary, boardLog);
}

const board = new Map<string, BoardChunk>();
const loaded: BoardChunk[] = [];
try {
  const existing = await readFile(boardLog, "utf8");
  for (const line of existing.split("\n")) {
    if (line === "") continue;
    loaded.push(JSON.parse(line) as BoardChunk);
  }
} catch {
  // The log does not exist until the first chunk.
}
loaded.sort((a, b) => a.s - b.s);
let folded = false;
for (const prior of loaded) {
  if (addMined(prior) === "rewrite") folded = true;
}
if (folded || board.size !== loaded.length) await writeBoard();

const Pattern = patterns[PATTERN as keyof typeof patterns];
if (!Pattern) throw new Error("Unknown pattern");
const pattern = new Pattern({ x: CENTER_X, y: CENTER_Y }, CHUNK_SIZE);
let footprint = pattern.fromChunk;

let written = 0;
let examined = 0;
const startedAt = Date.now();
const writeLimit = CHUNKS === 0 ? Infinity : CHUNKS;
const examineLimit = CHUNKS === 0 ? Infinity : Math.max(CHUNKS * 20, 20);
const stopAt = MINUTES === 0 ? Infinity : startedAt + MINUTES * 60_000;

while (written < writeLimit && examined < examineLimit && Date.now() < stopAt) {
  examined += 1;
  const key = `${footprint.bottomLeft.x},${footprint.bottomLeft.y},${footprint.sideLength}`;
  const xCenter = footprint.bottomLeft.x + footprint.sideLength / 2;
  const yCenter = footprint.bottomLeft.y + footprint.sideLength / 2;
  const xMin = Math.abs(xCenter) - footprint.sideLength / 2;
  const yMin = Math.abs(yCenter) - footprint.sideLength / 2;
  const nearest = xMin ** 2 + yMin ** 2;
  const insideCircle = nearest < INNER_RADIUS ** 2;
  const outsideWorld = nearest >= WORLD_RADIUS ** 2;
  const already = covered(
    footprint.bottomLeft.x,
    footprint.bottomLeft.y,
    footprint.sideLength,
  );
  if (!already && !insideCircle && !outsideWorld) {
    const started = Date.now();
    // For multiple cores, run workerIndex 0 through CORES - 1 and merge the hits.
    const hits = exploreChunk(
      footprint.bottomLeft.x,
      footprint.bottomLeft.y,
      footprint.sideLength,
      0,
      1,
    );
    const center = {
      x: footprint.bottomLeft.x + footprint.sideLength / 2,
      y: footprint.bottomLeft.y + footprint.sideLength / 2,
    };
    const body = {
      x: footprint.bottomLeft.x,
      y: footprint.bottomLeft.y,
      s: footprint.sideLength,
      l: hits,
      p: perlin(center, { ...spaceFloor, floor: false }),
    };
    const outcome = addMined(body);
    if (outcome === "rewrite") await writeBoard();
    else await appendFile(boardLog, `${JSON.stringify(body)}\n`);
    written += 1;
    console.log(
      `mined ${written} ${key} planets ${hits.length} ${(Date.now() - started) / 1000}s cores ${CORES}`,
    );
  }
  footprint = pattern.nextChunk(footprint);
}

const elapsedMinutes = (Date.now() - startedAt) / 60_000;
console.log(
  `done ${written} after ${elapsedMinutes.toFixed(1)} minutes -> ${boardLog}`,
);
```

After it is running, tell the owner which chunk was just written, how many planets it contained, and the folder. If the owner says stop, end the process. Do not invent fleet-move transactions.
