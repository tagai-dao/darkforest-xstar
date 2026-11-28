import type { Chunk } from "@df/types";
import { type DBSchema, openDB } from "idb";

import { getChunkKey } from "../Miner/ChunkUtils";

interface SharedMapDatabase extends DBSchema {
  chunks: {
    key: [scope: string, footprint: string];
    value: { scope: string; chunk: Chunk };
    indexes: { byWallet: string };
  };
}

function openSharedMapCache() {
  return openDB<SharedMapDatabase>("df-shared-map", 1, {
    upgrade(database) {
      database.createObjectStore("chunks").createIndex("byWallet", "scope");
    },
  });
}

export async function loadSharedMapChunks(scope: string): Promise<Chunk[]> {
  const database = await openSharedMapCache();
  try {
    const rows = await database.getAllFromIndex("chunks", "byWallet", scope);
    return rows.map(({ chunk }) => chunk);
  } finally {
    database.close();
  }
}

export async function saveSharedMapChunks(
  scope: string,
  chunks: Chunk[],
): Promise<void> {
  const database = await openSharedMapCache();
  try {
    const transaction = database.transaction("chunks", "readwrite");
    await Promise.all([
      ...chunks.map((chunk) =>
        transaction.store.put({ scope, chunk }, [
          scope,
          getChunkKey(chunk.chunkFootprint),
        ]),
      ),
      transaction.done,
    ]);
  } finally {
    database.close();
  }
}
