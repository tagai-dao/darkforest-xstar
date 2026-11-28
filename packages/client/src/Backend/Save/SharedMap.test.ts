import { locationIdFromHexStr } from "@df/serde";
import type { Chunk, WorldLocation } from "@df/types";
import { describe, expect, it } from "vitest";

import {
  missingSharedChunks,
  parseSharedMap,
  serializeSharedMap,
  sharedChunksInBounds,
  sharedMapBounds,
} from "./SharedMap";

const game = {
  chainId: 56,
  world: "0x0000000000000000000000000000000000001234",
};

function location(id: string, x: number, y: number): WorldLocation {
  return {
    hash: locationIdFromHexStr(id),
    coords: { x, y },
    perlin: 12,
    biomebase: 16,
  };
}

function chunk(
  x: number,
  y: number,
  sideLength: number,
  planetLocations: WorldLocation[] = [],
): Chunk {
  return {
    chunkFootprint: { bottomLeft: { x, y }, sideLength },
    perlin: 13.5,
    planetLocations,
  };
}

const area = (chunks: Chunk[]) =>
  chunks.reduce(
    (total, current) => total + current.chunkFootprint.sideLength ** 2,
    0,
  );
const planets = (chunks: Chunk[]) =>
  chunks.flatMap((region) => region.planetLocations.map(({ hash }) => hash));

describe("shared map", () => {
  it("rounds either drag direction inward and keeps planets inside the selection only", () => {
    const included = location("11", -48, 0);
    const rightEdge = location("12", -16, 16);
    const outside = location("13", -50, 18);
    const topEdge = location("14", -24, 32);
    const bounds = sharedMapBounds({ x: -9, y: 36 }, { x: -49, y: -1 });
    expect(bounds).toEqual({ left: -48, bottom: 0, right: -16, top: 32 });
    const selected = sharedChunksInBounds(
      [
        chunk(-64, 0, 64, [included, rightEdge, outside, topEdge]),
        chunk(0, 0, 16),
      ],
      bounds,
    );
    expect(area(selected)).toBe(1024);
    expect(planets(selected)).toEqual([included.hash]);
    expect(parseSharedMap(serializeSharedMap(game, selected), game)).toEqual(
      selected,
    );
  });

  it("only fills gaps in local coverage even when a shared chunk contains smaller known chunks", () => {
    const localPlanet = location("21", 3, 3);
    const importedPlanet = location("22", 16, 16);
    const known = [chunk(0, 0, 16, [localPlanet]), chunk(32, 0, 32)];
    const incoming = [
      chunk(0, 0, 64, [localPlanet, importedPlanet]),
      chunk(32, 16, 16),
      chunk(16, 16, 16, [importedPlanet]),
    ];

    const missing = missingSharedChunks(known, incoming);
    expect(area(missing)).toBe(4096 - 1024 - 256);
    expect(planets(missing)).toEqual([importedPlanet.hash]);
    expect(missingSharedChunks([...known, ...missing], incoming)).toEqual([]);
    expect(
      missingSharedChunks([...known, ...missing], [...known, ...missing]),
    ).toEqual([]);
  });

  it("rejects a different game and malformed geometry before import", () => {
    const file = serializeSharedMap(game, [
      chunk(0, 0, 16, [location("31", 4, 4)]),
    ]);
    expect(() => parseSharedMap(file, { ...game, chainId: 1 })).toThrow(
      "另一局",
    );
    expect(() => parseSharedMap(file, { ...game, world: "0x1" })).toThrow(
      "另一局",
    );
    expect(() => parseSharedMap(file.slice(0, -3), game)).toThrow("无法读取");
    const malformed = JSON.parse(file);
    malformed.chunks[0].l[0].x = 16;
    expect(() => parseSharedMap(JSON.stringify(malformed), game)).toThrow(
      "无效",
    );
    malformed.chunks[0].l = [];
    malformed.chunks[0].s = 7;
    expect(() => parseSharedMap(JSON.stringify(malformed), game)).toThrow(
      "无效",
    );
  });

  it("does not include empty space or a selection smaller than one full map tile", () => {
    expect(
      sharedChunksInBounds(
        [chunk(0, 0, 16)],
        sharedMapBounds({ x: 1, y: 1 }, { x: 15, y: 15 }),
      ),
    ).toEqual([]);
    expect(
      sharedChunksInBounds(
        [chunk(0, 0, 16)],
        sharedMapBounds({ x: 16, y: 16 }, { x: 48, y: 48 }),
      ),
    ).toEqual([]);
  });
});
