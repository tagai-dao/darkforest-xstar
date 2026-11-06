import type { PersistedChunk } from "../../_types/darkforest/api/ChunkStoreTypes";

/** 钱包目录里的地图。一块一行，只往后追加。 */
export const BOARD_LOG_NAME = "knownBoard.ndjson";

const encoder = new TextEncoder();

function isChunk(value: unknown): value is PersistedChunk {
  if (!value || typeof value !== "object") {
    return false;
  }
  const chunk = value as PersistedChunk;
  return (
    typeof chunk.x === "number" &&
    typeof chunk.y === "number" &&
    typeof chunk.s === "number" &&
    typeof chunk.p === "number" &&
    Array.isArray(chunk.l)
  );
}

/**
 * 读追加日志里已经写完的行。最后一行没有换行，说明还在写，这次不收。
 * byteLength 是按字节计的，下一轮从这个位置接着读。
 */
export function parseBoardLog(text: string): {
  chunks: PersistedChunk[];
  byteLength: number;
} {
  const end = text.lastIndexOf("\n");
  if (end < 0) {
    return { chunks: [], byteLength: 0 };
  }
  const complete = text.slice(0, end + 1);
  const chunks: PersistedChunk[] = [];
  for (const line of complete.split("\n")) {
    if (line === "") {
      continue;
    }
    try {
      const parsed = JSON.parse(line) as unknown;
      if (isChunk(parsed)) {
        chunks.push(parsed);
      }
    } catch {
      // 坏行跳过。偏移仍前进，避免下一轮卡在同一行。
    }
  }
  return { chunks, byteLength: encoder.encode(complete).byteLength };
}

export function boardLine(chunk: PersistedChunk): string {
  return `${JSON.stringify(chunk)}\n`;
}
