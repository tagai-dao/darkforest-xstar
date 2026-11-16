import { closeSync, openSync, writeSync } from "node:fs";
import { readFile, rename, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { EventEmitter, once } from "node:events";
import path from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { isMainThread, parentPort, Worker } from "node:worker_threads";
import bigInt from "big-integer";
import {
  SpiralPattern,
  TowardsCenterPattern,
} from "./src/Backend/Miner/MiningPatterns.ts";
import { mimcHash, perlin } from "./src/Shared/hashing/index.ts";

type Planet = { x: number; y: number; h: string; p: number; b: number };
type Chunk = { x: number; y: number; s: number; l: Planet[]; p: number };
type Task = { x: number; y: number; s: number };
const wallet = "0x8153c8c8ef6d9e7e7ee11333f33048835325add0";
const boardLog =
  process.env.DF_MINE_BOARD ||
  path.join(
    "/Volumes/Extreme Pro/wangxi/study/mud-study",
    "31337-0xfdf868ea710ffd8cd33b829c5aff79edd15ecd5f-1",
    wallet,
    "knownBoard.ndjson",
  );
const maxWrites = Number(process.env.DF_MINE_CHUNKS || 0);
const patternName = process.env.DF_MINE_PATTERN || "spiral";
const nativeBinary = process.env.DF_MINE_NATIVE;
const nativeConstants = process.env.DF_MINE_CONSTANTS;
const cores = Number(process.env.DF_MINE_CORES || (nativeBinary ? 10 : 4));
const size = 16;
const maxSide = 16384;
const space = {
  key: 1730,
  scale: 8192,
  mirrorX: false,
  mirrorY: false,
  floor: true,
};
const biome = { ...space, key: 1731 };
const ub = bigInt(
  "21888242871839275222246405745257275088548364400416034343698204186575808495617",
).divide(16384);

function key(c: Task): string {
  return `${c.x},${c.y},${c.s}`;
}

if (!isMainThread) {
  const hashPlanet = mimcHash(1729);
  parentPort!.on("message", (task: Task) => {
    const hits: Planet[] = [];
    for (let x = task.x; x < task.x + task.s; x++)
      for (let y = task.y; y < task.y + task.s; y++) {
        const hash = hashPlanet(x, y);
        if (hash.lesser(ub))
          hits.push({
            x,
            y,
            h: hash.toString(16).padStart(64, "0"),
            p: perlin({ x, y }, space),
            b: perlin({ x, y }, biome),
          });
      }
    const chunk: Chunk = {
      ...task,
      l: hits,
      p: perlin(
        { x: task.x + task.s / 2, y: task.y + task.s / 2 },
        { ...space, floor: false },
      ),
    };
    parentPort!.postMessage(chunk);
  });
} else {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}

async function main(): Promise<void> {
  const save = path.dirname(boardLog);
  const { world } = JSON.parse(
    await readFile(path.join(save, "game.json"), "utf8"),
  );
  const [home] = JSON.parse(
    await readFile(path.join(save, "homeLocations.json"), "utf8"),
  );
  const requestedX = process.env.DF_MINE_CENTER_X;
  const requestedY = process.env.DF_MINE_CENTER_Y;
  if ((requestedX === undefined) !== (requestedY === undefined))
    throw new Error("Set both DF_MINE_CENTER_X and DF_MINE_CENTER_Y");
  const center =
    requestedX === undefined
      ? home.coords
      : { x: Number(requestedX), y: Number(requestedY) };
  if (!Number.isSafeInteger(center.x) || !Number.isSafeInteger(center.y))
    throw new Error("Mining center must have integer coordinates");
  const readerUrl = pathToFileURL(
    path.resolve(
      process.env.DF_MINE_CHAIN_READER ||
        "scripts/early-center/early-center.mjs",
    ),
  ).href;
  const { readWorldBoundary } = await import(readerUrl);
  let boundary = await readWorldBoundary(world);
  if (
    Math.hypot(center.x, center.y) < boundary.innerRadius ||
    Math.hypot(center.x, center.y) >= boundary.worldRadius
  )
    throw new Error("Mining center is outside the explorable area");
  let boundaryAvailable = true;
  console.log(
    `boundary ${boundary.innerRadius} at ${boundary.block}, center ${center.x},${center.y}, cores ${cores}`,
  );
  const board = new Map<string, Chunk>();
  const loaded: Chunk[] = [];
  try {
    const text = await readFile(boardLog, "utf8");
    for (const line of text.split("\n"))
      if (line) loaded.push(JSON.parse(line));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  function covered(x: number, y: number, s: number): boolean {
    for (let side = s; side <= maxSide; side *= 2) {
      const bx = Math.floor(x / side) * side,
        by = Math.floor(y / side) * side;
      if (board.has(`${bx},${by},${side}`)) return true;
    }
    return false;
  }
  function add(chunk: Chunk): "skip" | "append" | "rewrite" {
    if (covered(chunk.x, chunk.y, chunk.s)) return "skip";
    let current = chunk,
      merged = false;
    while (current.s < maxSide) {
      const d = current.s * 2,
        x0 = Math.floor(current.x / d) * d,
        y0 = Math.floor(current.y / d) * d;
      const siblings: Chunk[] = [];
      for (let i = 0; i < 2; i++)
        for (let j = 0; j < 2; j++) {
          const x = x0 + i * current.s,
            y = y0 + j * current.s;
          if (x === current.x && y === current.y) continue;
          const sibling = board.get(`${x},${y},${current.s}`);
          if (!sibling) {
            board.set(key(current), current);
            return merged ? "rewrite" : "append";
          }
          siblings.push(sibling);
        }
      for (const sibling of siblings) board.delete(key(sibling));
      const p =
        Math.floor(
          ((current.p + siblings.reduce((n, c) => n + c.p, 0)) / 4) * 1000,
        ) / 1000;
      current = {
        x: x0,
        y: y0,
        s: d,
        l: [...current.l, ...siblings.flatMap((c) => c.l)],
        p,
      };
      merged = true;
    }
    board.set(key(current), current);
    return merged ? "rewrite" : "append";
  }
  async function rewrite(): Promise<void> {
    const text =
      [...board.values()].map((c) => JSON.stringify(c)).join("\n") + "\n";
    if (Buffer.byteLength(text) >= (await stat(boardLog)).size) return;
    const temp = `${boardLog}.tmp`;
    await writeFile(temp, text);
    await rename(temp, boardLog);
  }
  loaded.sort((a, b) => a.s - b.s);
  for (const chunk of loaded) add(chunk);

  if (patternName !== "spiral" && patternName !== "center")
    throw new Error(`Unsupported mining pattern ${patternName}`);
  const pattern =
    patternName === "center"
      ? new TowardsCenterPattern(center, size)
      : new SpiralPattern(center, size);
  let footprint = pattern.fromChunk;
  let scheduled = 0,
    written = 0,
    stopping = false;
  let failure: unknown;
  let finishing = false;
  let refreshing = false;
  let scanQueued = false;
  let lines: string[] = [];
  const writer = openSync(boardLog, "a");
  class NativeWorker extends EventEmitter {
    private child;
    private assigned?: Task;

    constructor() {
      super();
      if (!nativeBinary || !nativeConstants)
        throw new Error("Native miner paths are required");
      this.child = spawn(nativeBinary, [nativeConstants], {
        stdio: ["pipe", "pipe", "inherit"],
      });
      const lines = createInterface({ input: this.child.stdout });
      lines.on("line", (line) => {
        try {
          const raw = JSON.parse(line);
          const task = this.assigned;
          if (!task || raw.x !== task.x || raw.y !== task.y || raw.s !== task.s)
            throw new Error("Native miner returned the wrong chunk");
          this.assigned = undefined;
          const l: Planet[] = raw.hits.map(
            ([x, y, h]: [number, number, string]) => ({
              x,
              y,
              h,
              p: perlin({ x, y }, space),
              b: perlin({ x, y }, biome),
            }),
          );
          this.emit("message", {
            ...task,
            l,
            p: perlin(
              { x: task.x + task.s / 2, y: task.y + task.s / 2 },
              {
                ...space,
                floor: false,
              },
            ),
          } satisfies Chunk);
        } catch (error) {
          this.emit("error", error);
        }
      });
      this.child.on("error", (error) => this.emit("error", error));
      this.child.on("exit", (code) => {
        if (!stopping)
          this.emit("error", new Error(`Native miner exited: ${code}`));
        busy.delete(this);
        if (stopping && busy.size === 0) void finish();
      });
    }

    postMessage(task: Task): void {
      if (this.assigned) throw new Error("Native miner already has a chunk");
      this.assigned = task;
      this.child.stdin.write(`0 ${task.x} ${task.y} ${task.s}\n`);
    }

    async terminate(): Promise<void> {
      if (this.child.exitCode !== null || this.child.signalCode !== null)
        return;
      const exited = once(this.child, "exit");
      this.child.kill("SIGTERM");
      await exited;
    }
  }

  const workers: (Worker | NativeWorker)[] = [];
  const busy = new Set<Worker | NativeWorker>();
  const flushTimer = setInterval(flush, 500);
  const boundaryTimer = setInterval(() => {
    void refreshBoundary();
  }, 2000);

  function flush(): void {
    if (!lines.length) return;
    const batch = Buffer.from(lines.join(""));
    lines = [];
    try {
      let offset = 0;
      while (offset < batch.length)
        offset += writeSync(writer, batch, offset, batch.length - offset);
    } catch (error) {
      stop(error);
    }
  }

  async function refreshBoundary(): Promise<void> {
    if (stopping || refreshing) return;
    refreshing = true;
    try {
      const next = await readWorldBoundary(world);
      if (!boundaryAvailable)
        console.log(`boundary resumed at ${next.innerRadius}`);
      boundary = next;
      boundaryAvailable = true;
      dispatch();
    } catch (error) {
      if (boundaryAvailable)
        console.error("Waiting for a valid world boundary:", error);
      boundaryAvailable = false;
    } finally {
      refreshing = false;
    }
  }

  function next(): Task | undefined {
    for (let scanned = 0; scanned < 4096; scanned++) {
      const task = {
        x: footprint.bottomLeft.x,
        y: footprint.bottomLeft.y,
        s: footprint.sideLength,
      };
      const xm = Math.max(0, Math.abs(task.x + task.s / 2) - task.s / 2);
      const ym = Math.max(0, Math.abs(task.y + task.s / 2) - task.s / 2);
      const near = xm * xm + ym * ym;
      const alreadyMined = covered(task.x, task.y, task.s);
      if (!alreadyMined && near < boundary.innerRadius ** 2) return;
      footprint = pattern.nextChunk(footprint);
      const atCenter = patternName === "center" && task.x === 0 && task.y === 0;
      if (!alreadyMined && near < boundary.worldRadius ** 2) {
        if (atCenter) stopping = true;
        return task;
      }
      if (atCenter) {
        stop();
        return;
      }
    }
    if (!scanQueued) {
      scanQueued = true;
      setImmediate(() => {
        scanQueued = false;
        dispatch();
      });
    }
  }

  function dispatch(): void {
    if (!boundaryAvailable) return;
    for (const worker of workers) {
      if (stopping) break;
      if (busy.has(worker)) continue;
      if (maxWrites > 0 && scheduled >= maxWrites) {
        stop();
        break;
      }
      const task = next();
      if (!task) break;
      scheduled++;
      busy.add(worker);
      worker.postMessage(task);
    }
    if (stopping && busy.size === 0) void finish();
  }

  function stop(error?: unknown): void {
    if (error) failure ??= error;
    stopping = true;
    if (busy.size === 0) void finish();
  }

  async function finish(): Promise<void> {
    if (finishing) return;
    finishing = true;
    clearInterval(flushTimer);
    clearInterval(boundaryTimer);
    try {
      flush();
      closeSync(writer);
      await Promise.all(workers.map((w) => w.terminate()));
      if (failure) throw failure;
      if (written) await rewrite();
      console.log(`done ${written} chunks -> ${boardLog}`);
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    }
  }
  process.on("SIGINT", () => stop());
  process.on("SIGTERM", () => stop());
  for (let i = 0; i < cores; i++) {
    const worker = nativeBinary
      ? new NativeWorker()
      : new Worker(new URL(import.meta.url));
    workers.push(worker);
    worker.on("message", (chunk: Chunk) => {
      busy.delete(worker);
      if (add(chunk) !== "skip") {
        lines.push(`${JSON.stringify(chunk)}\n`);
        written++;
        if (lines.length >= 32) flush();
        if (written === 1 || written % 500 === 0)
          console.log(
            `mined ${written} ${key(chunk)} planets ${chunk.l.length} cores ${cores}`,
          );
      }
      if (stopping && busy.size === 0) void finish();
      else dispatch();
    });
    worker.on("error", (error) => {
      busy.delete(worker);
      stop(error);
    });
  }
  dispatch();
}
