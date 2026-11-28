import { MAX_PERLIN_VALUE } from "@df/hashing";
import type { Chunk, Rectangle, WorldCoords } from "@df/types";

import type { PersistedChunk } from "../../_types/darkforest/api/ChunkStoreTypes";
import { MAX_CHUNK_SIZE, MIN_CHUNK_SIZE } from "../../Frontend/Utils/constants";
import {
  getChunkKey,
  getChunkOfSideLengthContainingPoint,
  toExploredChunk,
  toPersistedChunk,
} from "../Miner/ChunkUtils";
import type { GameId } from "./GameSave";

export { MIN_CHUNK_SIZE };
export const maxSharedMapBytes = 32 * 1024 * 1024;
const fileFormat = "darkforest-shared-map";

export type MapBounds = {
  left: number;
  bottom: number;
  right: number;
  top: number;
};

export function sharedMapBounds(
  start: WorldCoords,
  end: WorldCoords,
): MapBounds {
  const lower = (a: number, b: number) =>
    Math.ceil(Math.min(a, b) / MIN_CHUNK_SIZE) * MIN_CHUNK_SIZE + 0;
  const upper = (a: number, b: number) =>
    Math.floor(Math.max(a, b) / MIN_CHUNK_SIZE) * MIN_CHUNK_SIZE;
  return {
    left: lower(start.x, end.x),
    bottom: lower(start.y, end.y),
    right: upper(start.x, end.x),
    top: upper(start.y, end.y),
  };
}

function isAlignedSquare({
  bottomLeft: { x, y },
  sideLength,
}: Rectangle): boolean {
  return (
    Number.isSafeInteger(x) &&
    Number.isSafeInteger(y) &&
    Number.isSafeInteger(sideLength) &&
    sideLength >= MIN_CHUNK_SIZE &&
    sideLength <= MAX_CHUNK_SIZE &&
    (sideLength & (sideLength - 1)) === 0 &&
    x % sideLength === 0 &&
    y % sideLength === 0 &&
    Number.isSafeInteger(x + sideLength) &&
    Number.isSafeInteger(y + sideLength)
  );
}

function chunkBounds({ bottomLeft, sideLength }: Rectangle): MapBounds {
  return {
    left: bottomLeft.x,
    bottom: bottomLeft.y,
    right: bottomLeft.x + sideLength,
    top: bottomLeft.y + sideLength,
  };
}

function containsPoint(bounds: MapBounds, { x, y }: WorldCoords): boolean {
  return (
    x >= bounds.left && x < bounds.right && y >= bounds.bottom && y < bounds.top
  );
}

function splitChunk(chunk: Chunk): Chunk[] {
  const { bottomLeft, sideLength } = chunk.chunkFootprint;
  const half = sideLength / 2;
  const parts = [
    { x: bottomLeft.x, y: bottomLeft.y },
    { x: bottomLeft.x + half, y: bottomLeft.y },
    { x: bottomLeft.x, y: bottomLeft.y + half },
    { x: bottomLeft.x + half, y: bottomLeft.y + half },
  ].map(
    (corner): Chunk => ({
      chunkFootprint: { bottomLeft: corner, sideLength: half },
      planetLocations: [],
      perlin: chunk.perlin,
    }),
  );
  for (const location of chunk.planetLocations) {
    const index =
      Number(location.coords.x >= bottomLeft.x + half) +
      2 * Number(location.coords.y >= bottomLeft.y + half);
    parts[index].planetLocations.push(location);
  }
  return parts;
}

export function sharedChunksInBounds(
  chunks: Iterable<Chunk>,
  bounds: MapBounds,
): Chunk[] {
  if (bounds.left >= bounds.right || bounds.bottom >= bounds.top) return [];
  const selected: Chunk[] = [];
  const visit = (chunk: Chunk) => {
    const { left, right, bottom, top } = chunkBounds(chunk.chunkFootprint);
    if (
      left >= bounds.right ||
      right <= bounds.left ||
      bottom >= bounds.top ||
      top <= bounds.bottom
    )
      return;
    if (
      left >= bounds.left &&
      right <= bounds.right &&
      bottom >= bounds.bottom &&
      top <= bounds.top
    ) {
      selected.push(chunk);
    } else if (chunk.chunkFootprint.sideLength > MIN_CHUNK_SIZE) {
      splitChunk(chunk).forEach(visit);
    }
  };
  for (const chunk of chunks) {
    if (isAlignedSquare(chunk.chunkFootprint)) visit(chunk);
  }
  return missingSharedChunks([], selected);
}

/** Aligned squares only overlap when one contains the other. */
export function missingSharedChunks(
  known: Iterable<Chunk>,
  incoming: Iterable<Chunk>,
): Chunk[] {
  const covered = new Set<string>();
  const ancestors = new Set<string>();
  const remember = (footprint: Rectangle) => {
    covered.add(getChunkKey(footprint));
    for (
      let size = footprint.sideLength * 2;
      size <= MAX_CHUNK_SIZE;
      size *= 2
    ) {
      ancestors.add(
        getChunkKey(
          getChunkOfSideLengthContainingPoint(footprint.bottomLeft, size),
        ),
      );
    }
  };
  for (const chunk of known) {
    if (isAlignedSquare(chunk.chunkFootprint)) remember(chunk.chunkFootprint);
  }

  const added: Chunk[] = [];
  const fill = (chunk: Chunk) => {
    const footprint = chunk.chunkFootprint;
    const key = getChunkKey(footprint);
    if (covered.has(key)) return;
    if (ancestors.has(key) && footprint.sideLength > MIN_CHUNK_SIZE) {
      splitChunk(chunk).forEach(fill);
    } else {
      added.push(chunk);
      remember(footprint);
    }
  };
  const largestFirst = [...incoming]
    .filter((chunk) => isAlignedSquare(chunk.chunkFootprint))
    .sort((a, b) => b.chunkFootprint.sideLength - a.chunkFootprint.sideLength);
  for (const chunk of largestFirst) {
    const { bottomLeft, sideLength } = chunk.chunkFootprint;
    let coveredByParent = false;
    for (let size = sideLength * 2; size <= MAX_CHUNK_SIZE; size *= 2) {
      if (
        covered.has(
          getChunkKey(getChunkOfSideLengthContainingPoint(bottomLeft, size)),
        )
      ) {
        coveredByParent = true;
        break;
      }
    }
    if (!coveredByParent) fill(chunk);
  }
  return added;
}

export function serializeSharedMap(game: GameId, chunks: Chunk[]): string {
  return JSON.stringify({
    format: fileFormat,
    version: 1,
    chainId: game.chainId,
    world: game.world.toLowerCase(),
    chunks: chunks.map(toPersistedChunk),
  });
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isPerlin(value: unknown): boolean {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_PERLIN_VALUE
  );
}

function isPersistedChunk(value: unknown): value is PersistedChunk {
  if (!object(value)) return false;
  const { x, y, s, l, p } = value;
  if (
    !isCoordinate(x) ||
    !isCoordinate(y) ||
    !isCoordinate(s) ||
    !isAlignedSquare({ bottomLeft: { x, y }, sideLength: s }) ||
    !isPerlin(p) ||
    !Array.isArray(l)
  )
    return false;

  const bounds = { left: x, bottom: y, right: x + s, top: y + s };
  return l.every(
    (planet: unknown) =>
      object(planet) &&
      isCoordinate(planet.x) &&
      isCoordinate(planet.y) &&
      containsPoint(bounds, { x: planet.x, y: planet.y }) &&
      typeof planet.h === "string" &&
      /^[0-9a-f]{64}$/.test(planet.h) &&
      isPerlin(planet.p) &&
      isPerlin(planet.b),
  );
}

export function parseSharedMap(text: string, game: GameId): Chunk[] {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    throw new Error("无法读取地图文件，请选择游戏导出的 JSON 文件。");
  }
  if (
    !object(file) ||
    file.format !== fileFormat ||
    file.version !== 1 ||
    !Array.isArray(file.chunks)
  ) {
    throw new Error("无法识别这份地图文件。");
  }
  if (
    file.chainId !== game.chainId ||
    typeof file.world !== "string" ||
    file.world.toLowerCase() !== game.world.toLowerCase()
  ) {
    throw new Error("这份地图来自另一局游戏。");
  }
  if (!file.chunks.every(isPersistedChunk))
    throw new Error("地图文件包含无效的区块或星球数据。");
  return file.chunks.map(toExploredChunk);
}
