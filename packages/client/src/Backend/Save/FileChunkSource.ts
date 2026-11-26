import type { PersistedTransaction } from "@df/types";
import type {
  Chunk,
  DiagnosticUpdater,
  EthAddress,
  LocationId,
  ModalId,
  ModalPosition,
  Rectangle,
  RevealedCoords,
  Transaction,
  WorldLocation,
} from "@df/types";

import type { PersistedChunk } from "../../_types/darkforest/api/ChunkStoreTypes";
import { MAX_CHUNK_SIZE } from "../../Frontend/Utils/constants";
import {
  getChunkKey,
  getChunkOfSideLengthContainingPoint,
  toExploredChunk,
} from "../Miner/ChunkUtils";
import type { SerializedPlugin } from "../Plugins/SerializedPlugin";
import { BOARD_LOG_NAME, parseBoardLog } from "./BoardLog";
import { type GameSaveFiles, parseGameSave } from "./GameSave";

const GRID_CELL = 1024;

/**
 * 块按 1024 坐标一格收好。一帧只打开镜头盖住的格子。
 */
class ChunkGrid {
  private readonly cells = new Map<string, Set<Chunk>>();

  add(chunk: Chunk): void {
    for (const key of this.keys(chunk)) {
      let cell = this.cells.get(key);
      if (!cell) {
        cell = new Set();
        this.cells.set(key, cell);
      }
      cell.add(chunk);
    }
  }

  remove(chunk: Chunk): void {
    for (const key of this.keys(chunk)) {
      this.cells.get(key)?.delete(chunk);
    }
  }

  near(left: number, bottom: number, right: number, top: number): Chunk[] {
    const found = new Set<Chunk>();
    const x0 = Math.floor(left / GRID_CELL);
    const y0 = Math.floor(bottom / GRID_CELL);
    const x1 = Math.floor(right / GRID_CELL);
    const y1 = Math.floor(top / GRID_CELL);
    for (let x = x0; x <= x1; x += 1) {
      for (let y = y0; y <= y1; y += 1) {
        const cell = this.cells.get(`${x},${y}`);
        if (!cell) {
          continue;
        }
        for (const chunk of cell) {
          found.add(chunk);
        }
      }
    }
    return [...found];
  }

  private keys(chunk: Chunk): string[] {
    const { x, y } = chunk.chunkFootprint.bottomLeft;
    const side = chunk.chunkFootprint.sideLength;
    const x0 = Math.floor(x / GRID_CELL);
    const y0 = Math.floor(y / GRID_CELL);
    const x1 = Math.floor((x + side - 1) / GRID_CELL);
    const y1 = Math.floor((y + side - 1) / GRID_CELL);
    const keys: string[] = [];
    for (let cx = x0; cx <= x1; cx += 1) {
      for (let cy = y0; cy <= y1; cy += 1) {
        keys.push(`${cx},${cy}`);
      }
    }
    return keys;
  }
}

export type DirectoryReader = {
  list(): Promise<string[]>;
  read(path: string): Promise<string>;
};

export async function loadWalletSave(
  reader: DirectoryReader,
): Promise<GameSaveFiles> {
  const files = new Map<string, string>();
  for (const path of await reader.list()) {
    files.set(path, await reader.read(path));
  }
  return parseGameSave(files);
}

export function readWatchedHome(
  text: string | undefined,
): WorldLocation | undefined {
  if (!text) {
    return undefined;
  }
  const homes = JSON.parse(text) as WorldLocation[];
  return homes[0];
}

export function chunksToStoreRecords(
  chunks: PersistedChunk[],
): Map<string, PersistedChunk> {
  const records = new Map<string, PersistedChunk>();
  for (const chunk of chunks) {
    records.set(`${chunk.x},${chunk.y},${chunk.s}`, chunk);
  }
  return records;
}

/**
 * 观看页和 IndexedDB 存档都要满足的读接口。
 * 页面只读文件时，写入方法保持内存，不回写浏览器数据库。
 */
export interface WatchChunkStore {
  destroy(): void;
  allChunks(): Iterable<Chunk>;
  hasMinedChunk(chunkFootprint: Rectangle): boolean;
  getChunkByFootprint(chunkFootprint: Rectangle): Chunk | undefined;
  addChunk(chunk: Chunk, persistChunk?: boolean): void;
  deleteChunk(chunk: Chunk, persistDelete?: boolean): void;
  chunksNear?(
    left: number,
    bottom: number,
    right: number,
    top: number,
  ): Iterable<Chunk>;
  getHomeLocations(): Promise<WorldLocation[]>;
  addHomeLocation(location: WorldLocation): Promise<void>;
  confirmHomeLocation(location: WorldLocation): Promise<void>;
  saveTouchedPlanetIds(ids: LocationId[]): Promise<void>;
  saveRevealedCoords(coords: RevealedCoords[]): Promise<void>;
  setDiagnosticUpdater(updater?: DiagnosticUpdater): void;
  onEthTxSubmit(tx: Transaction): Promise<void>;
  onEthTxComplete(hash: string): Promise<void>;
  getUnconfirmedSubmittedEthTxs(): Promise<PersistedTransaction[]>;
  loadPlugins(): Promise<SerializedPlugin[]>;
  savePlugins(plugins: SerializedPlugin[]): Promise<void>;
  loadModalPositions(): Promise<Map<ModalId, ModalPosition>>;
  saveModalPositions(
    modalPositions: Map<ModalId, ModalPosition>,
  ): Promise<void>;
}

export function memoryChunkStoreFromSave(save: GameSaveFiles): WatchChunkStore {
  const chunks = new Map<string, Chunk>();
  const grid = new ChunkGrid();
  let homes = save.homeLocations.map((location) => location as WorldLocation);

  function addChunk(chunk: Chunk): void {
    // 日志里已经是合成后的块。按文件原样放进画面。
    const key = getChunkKey(chunk.chunkFootprint);
    const previous = chunks.get(key);
    if (previous) {
      grid.remove(previous);
    }
    chunks.set(key, chunk);
    grid.add(chunk);
  }

  for (const persisted of save.chunks) {
    addChunk(toExploredChunk(persisted));
  }

  function getChunkByFootprint(chunkLoc: Rectangle): Chunk | undefined {
    let sideLength = chunkLoc.sideLength;
    while (sideLength <= MAX_CHUNK_SIZE) {
      const testChunkLoc = getChunkOfSideLengthContainingPoint(
        chunkLoc.bottomLeft,
        sideLength,
      );
      const chunk = chunks.get(getChunkKey(testChunkLoc));
      if (chunk) {
        return chunk;
      }
      sideLength *= 2;
    }
    return undefined;
  }

  return {
    destroy() {},
    allChunks: () => chunks.values(),
    hasMinedChunk: (footprint) => !!getChunkByFootprint(footprint),
    getChunkByFootprint,
    chunksNear: (left, bottom, right, top) =>
      grid.near(left, bottom, right, top),
    addChunk,
    deleteChunk(chunk) {
      const key = getChunkKey(chunk.chunkFootprint);
      const stored = chunks.get(key);
      if (stored) {
        grid.remove(stored);
        chunks.delete(key);
      }
    },
    async getHomeLocations() {
      return homes;
    },
    async addHomeLocation(location) {
      homes = [...homes, location];
    },
    async confirmHomeLocation(location) {
      homes = [location];
    },
    async saveTouchedPlanetIds() {},
    async saveRevealedCoords() {},
    setDiagnosticUpdater() {},
    async onEthTxSubmit() {},
    async onEthTxComplete() {},
    async getUnconfirmedSubmittedEthTxs() {
      return save.pendingTxs as PersistedTransaction[];
    },
    async loadPlugins() {
      return [];
    },
    async savePlugins() {},
    async loadModalPositions() {
      return new Map();
    },
    async saveModalPositions() {},
  };
}

export type FileStamp = {
  modified: number;
  size: number;
};

/**
 * 文件的修改时间或大小变了才需要再读内容。
 * 没变的路径留在原地图里，这一轮跳过。
 */
export function pathsToReread(
  entries: { path: string; modified: number; size: number }[],
  stamps: ReadonlyMap<string, FileStamp>,
): string[] {
  const next: string[] = [];
  for (const entry of entries) {
    const stamp = stamps.get(entry.path);
    if (
      !stamp ||
      stamp.modified !== entry.modified ||
      stamp.size !== entry.size
    ) {
      next.push(entry.path);
    }
  }
  return next;
}

export type BoardCursor = {
  offset: number;
  homeModified: number;
  homeSize: number;
  /** actions.ndjson 已读完的字节。 */
  actionsOffset?: number;
  priceModified?: number;
  priceSize?: number;
};

export type ActionRecord = {
  time?: string;
  strategy?: string;
  action: string;
  detail?: string;
  tx?: string;
};

export type AiproPrice = {
  token?: string;
  source?: string | null;
  price?: number | null;
  quotedAt?: string | null;
};

/** 追加日志里已经换行的 JSON。半行留到下一轮。 */
export function parseCompleteJsonLines(text: string): {
  values: unknown[];
  byteLength: number;
} {
  const end = text.lastIndexOf("\n");
  if (end < 0) {
    return { values: [], byteLength: 0 };
  }
  const complete = text.slice(0, end + 1);
  const values: unknown[] = [];
  for (const line of complete.split("\n")) {
    if (line === "") {
      continue;
    }
    try {
      values.push(JSON.parse(line) as unknown);
    } catch {
      // 坏行跳过，偏移仍前进。
    }
  }
  return { values, byteLength: new TextEncoder().encode(complete).byteLength };
}

export function asActionRecord(value: unknown): ActionRecord | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const { action, time, at, strategy, detail, tx } = value as Record<
    string,
    unknown
  >;
  if (typeof action !== "string" || action === "") {
    return undefined;
  }
  const recordedTime = typeof time === "string" ? time : undefined;
  return {
    action,
    time: recordedTime || (typeof at === "string" ? at : undefined),
    strategy: typeof strategy === "string" ? strategy : undefined,
    detail:
      typeof detail === "string" ? detail : JSON.stringify(detail ?? undefined),
    tx: typeof tx === "string" ? tx : undefined,
  };
}

/**
 * 只读地图日志新长出来的字节，以及家的文件有没有被改过。
 * 不遍历 knownBoard 目录。
 */
async function readGrowingLog(
  root: FileSystemDirectoryHandle,
  name: string,
  offset: number,
): Promise<{ values: unknown[]; offset: number }> {
  const handle = await root.getFileHandle(name);
  const file = await handle.getFile();
  let next = offset;
  if (file.size < next) {
    next = 0;
  }
  if (file.size === next) {
    return { values: [], offset: next };
  }
  const parsed = parseCompleteJsonLines(await file.slice(next).text());
  return { values: parsed.values, offset: next + parsed.byteLength };
}

export async function readWalletTail(
  root: FileSystemDirectoryHandle,
  cursor: BoardCursor,
): Promise<{
  chunks: PersistedChunk[];
  /** 文件被整份重写过，调用方应先丢掉内存里的旧块。 */
  replace: boolean;
  homeText?: string;
  actions: ActionRecord[];
  priceText?: string;
}> {
  const chunks: PersistedChunk[] = [];
  let replace = false;
  try {
    const handle = await root.getFileHandle(BOARD_LOG_NAME);
    const file = await handle.getFile();
    if (file.size < cursor.offset) {
      cursor.offset = 0;
      replace = true;
    }
    if (file.size > cursor.offset) {
      const text = await file.slice(cursor.offset).text();
      const parsed = parseBoardLog(text);
      chunks.push(...parsed.chunks);
      cursor.offset += parsed.byteLength;
    }
  } catch {
    // 日志还没出现。下一轮再看。
  }

  let homeText: string | undefined;
  try {
    const handle = await root.getFileHandle("homeLocations.json");
    const file = await handle.getFile();
    if (
      file.lastModified !== cursor.homeModified ||
      file.size !== cursor.homeSize
    ) {
      const text = await file.text();
      try {
        JSON.parse(text);
        homeText = text;
        cursor.homeModified = file.lastModified;
        cursor.homeSize = file.size;
      } catch {
        // 家的文件可能写到一半。
      }
    }
  } catch {
    // 还没有家。
  }

  const actions: ActionRecord[] = [];
  try {
    const log = await readGrowingLog(
      root,
      "actions.ndjson",
      cursor.actionsOffset ?? 0,
    );
    cursor.actionsOffset = log.offset;
    for (const value of log.values) {
      const action = asActionRecord(value);
      if (action) {
        actions.push(action);
      }
    }
  } catch {
    // 还没有动作记录。
  }

  let priceText: string | undefined;
  try {
    const handle = await root.getFileHandle("price.json");
    const file = await handle.getFile();
    if (
      file.lastModified !== cursor.priceModified ||
      file.size !== cursor.priceSize
    ) {
      const text = await file.text();
      try {
        JSON.parse(text);
        priceText = text;
        cursor.priceModified = file.lastModified;
        cursor.priceSize = file.size;
      } catch {
        // 价格文件可能写到一半。
      }
    }
  } catch {
    // 价格口子还没写。
  }

  return { chunks, replace, homeText, actions, priceText };
}

/**
 * 读目录里新出现或被改过的文件。调用方持有 stamps，成功读完才记下时间戳。
 * 半截 JSON 不记时间戳，下一轮会再读。
 */
export async function readFolderChanges(
  root: FileSystemDirectoryHandle,
  stamps: Map<string, FileStamp>,
): Promise<Map<string, string>> {
  const texts = new Map<string, string>();

  async function walk(
    dir: FileSystemDirectoryHandle,
    prefix: string,
  ): Promise<void> {
    for await (const [name, handle] of dir.entries()) {
      const path = prefix ? `${prefix}/${name}` : name;
      if (handle.kind !== "file") {
        await walk(handle, path);
        continue;
      }
      const file = await handle.getFile();
      const previous = stamps.get(path);
      if (
        previous &&
        previous.modified === file.lastModified &&
        previous.size === file.size
      ) {
        continue;
      }
      const text = await file.text();
      if (path.endsWith(".json")) {
        try {
          JSON.parse(text);
        } catch {
          continue;
        }
      }
      stamps.set(path, { modified: file.lastModified, size: file.size });
      texts.set(path, text);
    }
  }

  await walk(root, "");
  return texts;
}

export async function readDirectoryHandle(
  root: FileSystemDirectoryHandle,
): Promise<DirectoryReader> {
  const files = new Map<string, string>();

  async function walk(
    dir: FileSystemDirectoryHandle,
    prefix: string,
  ): Promise<void> {
    for await (const [name, handle] of dir.entries()) {
      const path = prefix ? `${prefix}/${name}` : name;
      if (handle.kind === "file") {
        files.set(path, await (await handle.getFile()).text());
      } else {
        await walk(handle, path);
      }
    }
  }

  await walk(root, "");
  return {
    list: async () => [...files.keys()],
    read: async (path) => files.get(path) ?? "",
  };
}

export function watcherAccount(save: GameSaveFiles): EthAddress {
  return save.agent.address as EthAddress;
}
