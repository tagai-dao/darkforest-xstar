# Mining

Mine only after the wallet has joined and a home planet is saved in `homeLocations.json`. The center is that planet. Finding the home is [home.md](home.md). Moving fleets is not part of this file.

The repository does not contain a mining script. Write the example below to a temporary file, fill in the owner's choices, and run it. Do not commit that temporary file.

## First ring, then the page, then the question

The home chunk is the side-16 square that contains the home. Its bottom-left corner is `floor(x / 16) * 16`, `floor(y / 16) * 16`. The first ring is that chunk plus the eight side-16 chunks that touch it by a side or a corner. Offsets from the home chunk are `-16`, `0`, and `16` on each axis, except `0, 0`, which is the home chunk itself.

Do not start the first ring merely because the home files appear. [home.md](home.md) asks, in the same reply as the new coordinates, whether to mine and which strategy starts the game. Wait for that answer. Once they say to mine, skip a chunk inside the inner circle or outside the world, using the nearest-corner test later in this file. Skip a side-16 square already inside a chunk in `knownBoard.ndjson`, including every square the home search finished and wrote. Do not hash those squares again. A finished square updates the in-memory map and waits in a buffer. Do not write the log between squares.

When that reply is sent, tell the owner three things in their language, inside the mining and strategy question:

1. Open `http://localhost:3000/redpill/0x3295A33430Bb33696b5F04DC12DD91276213100e`.
2. The folder to import is this wallet's folder: `<save root>/31337-0x3295a33430bb33696b5f04dc12dd91276213100e-<season>/<wallet lowercase>`.
3. On the page, click `打开钱包目录` and select that wallet folder. It must contain `agent.json` directly. The season folder above it is the wrong folder. The owner does not select the folder a second time.

Example:

> The home is at the coordinates in homeLocations.json, registered as the name you chose. Open http://localhost:3000/redpill/0x3295A33430Bb33696b5F04DC12DD91276213100e and click 打开钱包目录. Select the wallet folder. Start mining from that home? The default is one core, spiraling outward, until you say stop. You can instead pick a pattern (swiss, center, or center2), a core count (2, 4, 8, 16, or 32), another center outside the inner circle, a fixed number of chunks, or a duration such as 60 minutes. Which strategy should play: aggressive, conservative, offensive, or profit?

Ask that once, in the owner's language, as soon as the home files exist. Wait. Then mine from the home with their mining choices, write `strategy.txt` with the strategy filename, and continue play. Do not ask the owner to confirm the home. If they have not opened the page yet, the address and the folder path are already in the question. Do not send a second copy unless they ask where to look.

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

The question above is that ask. Do not ask it a second time after the ring is written. A yes that also names a strategy writes `strategy.txt` and, after mining has started, play uses that file. If the reply agrees to mine but names no strategy, ask only for the strategy and wait. If it names a strategy but not mining, write `strategy.txt` and ask only whether to mine.

A yes, or words such as "default" or "start", means the default row. If the owner names some of the other choices, use those and keep the default for anything they left out. "One hour" means `MINUTES = 60`. If the center they name is inside the inner circle, say so and wait for another center. Do not start with an illegal center.

After the choice is clear, run the example below with those values. Do not ask a second time. Do not ask about the chain or the contracts again.

## What mining does

Each core hashes one whole 16 by 16 square with MiMC. A coordinate is a planet when its hash is below `LOCATION_ID_UB / 16384`. The page draws new lines as they are appended to `knownBoard.ndjson`. Hashing does not wait for that write.

The chain uses these universe constants:

- Planet rarity `16384` (`[universe] a_sparsity`)
- Planet hash key `1729`
- Biome base key `1731`
- Space type key `1730`
- Perlin scale `8192`, with neither axis mirrored
- Chunk side `16`

The four patterns are the classes used by `ExplorePane`, in `packages/client/src/Backend/Miner/MiningPatterns.ts`. The hash functions are `mimcHash` and `perlin` in `packages/client/src/Shared/hashing`. Do not write a different hash. The planets would not match the chain.

The parent keeps one worker alive per chosen core for the whole run. Each worker receives one side-16 square, hashes all 256 coordinates, and returns that square. The parent then gives it the next square. Do not split one square across cores with `count % cores`, and do not start a new process per square.

Skip a side-16 square that sits inside a chunk already in `knownBoard.ndjson`, and continue with the pattern's next square. A stored chunk covers a square when that square's bottom-left lies inside it. Read the file once at the start, fold any four aligned siblings in memory, and use that map for the rest of the run. Do not read the log again per square, and do not rewrite it before hashing starts. Also skip a chunk inside the inner circle or outside the world. Take the chunk center, subtract half the side from the absolute value of each axis, and square-sum those two numbers. That is the squared distance from the origin to the chunk's nearest corner. Skip the chunk when that distance is below the live inner-circle radius, or when it is at or beyond the world radius `100000`. The inner circle starts at `75000` and shrinks. Read it the same way as [home.md](home.md). Do not hash a chunk inside the inner circle. Fleets cannot enter it.

Four stored chunks of the same side whose bottom-left corners are `2 * side` apart become one chunk of double that side. The new bottom-left is the minimum of the four. Planets are the four lists joined. Perlin is the average of the four, then kept to three decimal places. Repeat while the new chunk still has three siblings, and stop at side `16384`. This is the same fold as `addToChunkMap` in `packages/client/src/Backend/Miner/ChunkUtils.ts`. During the run this fold changes only the in-memory map, so a square already covered is not hashed again. The line appended for a new square is still that side-16 square, not the merged parent.

Hold those side-16 lines in a buffer. Append the buffer with one write when it holds 32 lines, or when 500ms have passed with any lines waiting, whichever comes first. Keep one file handle open for those appends. A crash loses only the lines still in that buffer. On stop, including SIGINT, wait for the squares already handed to workers, flush the buffer, and close the handle. Then write the merged map once to `knownBoard.ndjson.tmp` in the same folder. The page reads this log by byte offset and reads it again from the start only when the file gets shorter. Rename the temporary file over the log only when it is shorter. When it is not shorter, delete the temporary file and leave the appended log. A run that hashes nothing does not rewrite the log. If a previous run is still hashing, stop that process before this rewrite.

The log is one file in the wallet folder:

`<save root>/31337-0x3295a33430bb33696b5f04dc12dd91276213100e-<season>/<wallet lowercase>/knownBoard.ndjson`

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

Save the example as `packages/client/darkforest-mine.ts` and run it from `packages/client`, so the `./src` imports and the workers resolve. Delete that file when the run ends. Do not commit it. Replace `PATTERN`, `CORES`, `CHUNKS`, `MINUTES`, `CENTER_X`, `CENTER_Y`, and `WALLET` with the owner's choices. For one hour, set `MINUTES` to `60` and leave `CHUNKS` at `0`.

```bash
cd packages/client
./node_modules/.bin/tsx ./darkforest-mine.ts
```

```ts
import { open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { isMainThread, parentPort, Worker } from "node:worker_threads";
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
const CORES = 1; // 1 | 2 | 4 | 8 | 16 | 32. Each core hashes a whole square.
const FLUSH_LINES = 32;
const FLUSH_MS = 500;
const CHUNKS = 0; // 0 means no chunk limit. Stop earlier when MINUTES is also set.
const MINUTES = 0; // 0 means no time limit. 60 means stop after one hour.
const CENTER_X = 0; // Replace with the home planet x from homeLocations.json.
const CENTER_Y = 0; // Replace with the home planet y. Do not leave these at 0.
const SAVE_ROOT = "<folder the owner named>";
const SEASON = 1; // Replace with activeSeason() from the locker.
const WALLET = "<connected wallet, lowercase>";

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

type Hit = { x: number; y: number; h: string; p: number; b: number };
type BoardChunk = { x: number; y: number; s: number; l: Hit[]; p: number };
type MineJob = { id: number; x: number; y: number; s: number };

// 一个核心算完整的一块。不再把 256 个坐标按核拆开。
function exploreChunk(
  bottomLeftX: number,
  bottomLeftY: number,
  sideLength: number,
): Hit[] {
  const planetHash = mimcHash(1729);
  const rarity = bigInt(PLANET_RARITY);
  const hits: Hit[] = [];
  for (let x = bottomLeftX; x < bottomLeftX + sideLength; x += 1) {
    for (let y = bottomLeftY; y < bottomLeftY + sideLength; y += 1) {
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
  }
  return hits;
}

if (!isMainThread) {
  const port = parentPort;
  if (!port) throw new Error("missing parent port");
  port.on("message", (job: MineJob) => {
    const hits = exploreChunk(job.x, job.y, job.s);
    const center = { x: job.x + job.s / 2, y: job.y + job.s / 2 };
    const body: BoardChunk = {
      x: job.x,
      y: job.y,
      s: job.s,
      l: hits,
      p: perlin(center, { ...spaceFloor, floor: false }),
    };
    port.postMessage({ id: job.id, body });
  });
} else {
  await main();
}

async function main(): Promise<void> {
  if (CORES < 1) throw new Error("CORES must be at least 1");

  const wallet = WALLET.toLowerCase();
  const boardLog = path.join(
    SAVE_ROOT,
    `31337-0x3295a33430bb33696b5f04dc12dd91276213100e-${SEASON}`,
    wallet,
    "knownBoard.ndjson",
  );
  const board = new Map<string, BoardChunk>();

  function boardKey(chunk: { x: number; y: number; s: number }): string {
    return `${chunk.x},${chunk.y},${chunk.s}`;
  }

  // 已挖过的方块只查内存。父块盖住的 16 边方块也算挖过。
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

  // 四个对齐方块合成更大的一块，只为了后面不再重复挖。这里不写文件。
  function addMined(chunk: BoardChunk): void {
    if (covered(chunk.x, chunk.y, chunk.s)) return;
    let current = chunk;
    while (current.s < MAX_SIDE) {
      const double = current.s * 2;
      const x0 = Math.floor(current.x / double) * double;
      const y0 = Math.floor(current.y / double) * double;
      const siblings: BoardChunk[] = [];
      let missing = false;
      for (let i = 0; i < 2 && !missing; i += 1) {
        for (let j = 0; j < 2; j += 1) {
          const x = x0 + i * current.s;
          const y = y0 + j * current.s;
          if (x === current.x && y === current.y) continue;
          const sibling = board.get(`${x},${y},${current.s}`);
          if (!sibling) {
            missing = true;
            break;
          }
          siblings.push(sibling);
        }
      }
      if (missing) break;
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
    }
    board.set(boardKey(current), current);
  }

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
  // 启动时只在内存里折叠，不重写日志。
  loaded.sort((a, b) => a.s - b.s);
  for (const prior of loaded) addMined(prior);

  async function writeMerged(): Promise<void> {
    const lines = [...board.values()].map((chunk) => JSON.stringify(chunk));
    const text = lines.length === 0 ? "" : `${lines.join("\n")}\n`;
    const temporary = `${boardLog}.tmp`;
    await writeFile(temporary, text);
    const current = await stat(boardLog);
    const next = await stat(temporary);
    // 页面只在日志变短时从头重读。没变短就留下已追加的内容。
    if (next.size >= current.size) {
      await rm(temporary, { force: true });
      return;
    }
    await rename(temporary, boardLog);
  }

  const handle = await open(boardLog, "a");
  const pending: string[] = [];
  let writeChain: Promise<void> = Promise.resolve();
  let shuttingDown = false;
  let stopping = false;
  let written = 0;
  let lastKey = "-";
  let lastPlanets = 0;

  // 一次 write 可能写不完，按缓冲区偏移继续，直到这一批全部落盘。
  async function writeAll(text: string): Promise<void> {
    const buffer = Buffer.from(text);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesWritten } = await handle.write(
        buffer,
        offset,
        buffer.length - offset,
        null,
      );
      if (bytesWritten <= 0) throw new Error("board log write stalled");
      offset += bytesWritten;
    }
  }

  // 凑满 FLUSH_LINES，或由定时器每 FLUSH_MS 强制追加。挖矿循环不在这里等待。
  function flush(force: boolean): Promise<void> {
    writeChain = writeChain
      .then(async () => {
        if (pending.length === 0) return;
        if (!force && pending.length < FLUSH_LINES) return;
        const lines = pending.splice(0);
        await writeAll(lines.join(""));
        console.log(
          `appended ${lines.length} mined ${written} last ${lastKey} planets ${lastPlanets}`,
        );
      })
      .catch((error: unknown) => {
        console.error(error);
        stopping = true;
      });
    return writeChain;
  }

  const timer = setInterval(() => {
    if (!shuttingDown) void flush(true);
  }, FLUSH_MS);

  const Pattern = patterns[PATTERN as keyof typeof patterns];
  if (!Pattern) throw new Error("Unknown pattern");
  const pattern = new Pattern({ x: CENTER_X, y: CENTER_Y }, CHUNK_SIZE);
  let footprint = pattern.fromChunk;
  let examined = 0;
  let nextId = 0;
  let busy = 0;
  let dispatching = true;
  const startedAt = Date.now();
  const writeLimit = CHUNKS === 0 ? Infinity : CHUNKS;
  const examineLimit = CHUNKS === 0 ? Infinity : Math.max(CHUNKS * 20, 20);
  const stopAt = MINUTES === 0 ? Infinity : startedAt + MINUTES * 60_000;
  const working = new WeakSet<Worker>();
  let finishing: Promise<void> | null = null;
  let resolveDone: () => void = () => {};
  let rejectDone: (error: unknown) => void = () => {};
  const done = new Promise<void>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  process.on("SIGINT", () => {
    stopping = true;
    console.log("stopping after the squares already in flight");
  });
  process.on("SIGTERM", () => {
    stopping = true;
  });

  function nextSquare(): { x: number; y: number; s: number } | null {
    while (
      !stopping &&
      written + busy < writeLimit &&
      examined < examineLimit &&
      Date.now() < stopAt
    ) {
      examined += 1;
      const current = footprint;
      footprint = pattern.nextChunk(current);
      const x = current.bottomLeft.x;
      const y = current.bottomLeft.y;
      const s = current.sideLength;
      if (covered(x, y, s)) continue;
      const xCenter = x + s / 2;
      const yCenter = y + s / 2;
      const nearest =
        (Math.abs(xCenter) - s / 2) ** 2 + (Math.abs(yCenter) - s / 2) ** 2;
      if (nearest < INNER_RADIUS ** 2 || nearest >= WORLD_RADIUS ** 2) continue;
      return { x, y, s };
    }
    return null;
  }

  let workers: Worker[] = [];

  function finish(): Promise<void> {
    if (dispatching || busy !== 0) return Promise.resolve();
    if (!finishing) {
      finishing = (async () => {
        try {
          shuttingDown = true;
          clearInterval(timer);
          await flush(true);
          await handle.close();
          // 停的时候才把内存里合并过的地图写回一次。没挖到新块就不重写。
          if (written > 0) await writeMerged();
          await Promise.all(workers.map((worker) => worker.terminate()));
          const elapsedMinutes = (Date.now() - startedAt) / 60_000;
          console.log(
            `done ${written} after ${elapsedMinutes.toFixed(1)} minutes -> ${boardLog}`,
          );
          resolveDone();
        } catch (error) {
          rejectDone(error);
        }
      })();
    }
    return finishing;
  }

  function assign(worker: Worker): void {
    const square = nextSquare();
    if (!square) {
      void finish();
      return;
    }
    busy += 1;
    working.add(worker);
    const job: MineJob = { id: nextId, x: square.x, y: square.y, s: square.s };
    nextId += 1;
    worker.postMessage(job);
  }

  function onMessage(
    worker: Worker,
    message: { id: number; body: BoardChunk },
  ): void {
    working.delete(worker);
    busy -= 1;
    written += 1;
    lastKey = `${message.body.x},${message.body.y},${message.body.s}`;
    lastPlanets = message.body.l.length;
    // 日志追加的是这块 16 边方块。addMined 可能在内存里把它合成父块。
    pending.push(`${JSON.stringify(message.body)}\n`);
    addMined(message.body);
    if (pending.length >= FLUSH_LINES) void flush(false);
    assign(worker);
  }

  function onError(worker: Worker, error: unknown): void {
    console.error(error);
    stopping = true;
    if (working.delete(worker)) busy -= 1;
    void finish();
  }

  // 工人全程复用。一块算完再领下一块，不为每一块新开进程。
  workers = Array.from({ length: CORES }, () => {
    const worker = new Worker(new URL(import.meta.url), {
      execArgv: ["--import", "tsx"],
    });
    worker.on("message", (message: { id: number; body: BoardChunk }) =>
      onMessage(worker, message),
    );
    worker.on("error", (error) => onError(worker, error));
    return worker;
  });
  for (const worker of workers) assign(worker);
  dispatching = false;
  void finish();
  await done;
}
```

After it is running, tell the owner the folder, how many cores are hashing, and that finished squares are appended in batches. The script prints a line when a batch hits disk, with the running total. Pass that total on when the owner asks, or when the run stops. Do not send one message per square. If the owner says stop, send SIGINT and wait until the script prints `done`. That stop writes the remaining buffer and then rewrites the merged log once. Delete `packages/client/darkforest-mine.ts` after the run. Do not invent fleet-move transactions.
