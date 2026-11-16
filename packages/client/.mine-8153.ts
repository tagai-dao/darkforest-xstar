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
const CENTER_X = 78974; // Replace with the home planet x from homeLocations.json.
const CENTER_Y = 5433; // Replace with the home planet y. Do not leave these at 0.
const WALLET = "0x8153c8c8ef6d9e7e7ee11333f33048835325add0";

const PLANET_RARITY = 16384;
const CHUNK_SIZE = 16;
const MAX_SIDE = 16384;
const WORLD_RADIUS = 100000;
const INNER_RADIUS = 71428; // Replace with the live InnerCircle radius.
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
