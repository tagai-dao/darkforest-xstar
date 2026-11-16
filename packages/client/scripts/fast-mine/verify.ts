import { spawnSync } from "node:child_process";
import bigInt from "big-integer";
import { mimcHash } from "../../src/Shared/hashing/index.ts";

const bin = "/private/tmp/df-fast-mine-31337/hash-worker";
const constants = "/private/tmp/df-fast-mine-31337/mimc-constants.txt";
const threshold = bigInt(
  "21888242871839275222246405745257275088548364400416034343698204186575808495617",
).divide(16384);
const hash = mimcHash(1729);
const chunks = [
  [77216, 3744],
  [75000, 0],
  [68000, 12000],
  [-76000, 1000],
  [1000, -76000],
  [-76000, -1000],
  ...Array.from({ length: 14 }, (_, i) => [76000 - i * 80, 3400 + i * 16]),
];
const result = spawnSync(bin, [constants], {
  input: chunks.map(([x, y], i) => `${i} ${x} ${y} 16`).join("\n") + "\n",
  encoding: "utf8",
});
if (result.status !== 0) throw Error(result.stderr);
const lines = result.stdout.trim().split("\n").map(JSON.parse);
if (lines.length !== chunks.length) throw Error("chunk count mismatch");
for (let i = 0; i < chunks.length; i++) {
  const [x, y] = chunks[i];
  const expected = [];
  for (let px = x; px < x + 16; px++)
    for (let py = y; py < y + 16; py++) {
      const h = hash(px, py);
      if (h.lesser(threshold))
        expected.push([px, py, h.toString(16).padStart(64, "0")]);
    }
  if (JSON.stringify(lines[i].hits) !== JSON.stringify(expected))
    throw Error(`mismatch in chunk ${i}`);
}
console.log(
  JSON.stringify({
    verifiedChunks: chunks.length,
    verifiedCoordinates: chunks.length * 256,
    planetHits: lines.reduce((n, c) => n + c.hits.length, 0),
  }),
);
