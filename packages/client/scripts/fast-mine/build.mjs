import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const client = resolve(here, "../..");
const source = readFileSync(join(client, "src/Shared/hashing/mimc.ts"), "utf8");
const constantsBody = source.match(/const c = \[([\s\S]*?)\]\.map\(\(n\) => bigInt\(n\)\);/)?.[1];
if (!constantsBody) throw Error("MiMC constants were not found");
const constants = [...constantsBody.matchAll(/"(\d+)"/g)].map((match) => match[1]);
if (constants.length !== 220) throw Error("Expected 220 MiMC constants");

const output = "/private/tmp/df-fast-mine-31337";
mkdirSync(output, { recursive: true });
const constantsPath = join(output, "mimc-constants.txt");
const binary = join(output, "hash-worker");
writeFileSync(constantsPath, constants.join("\n") + "\n");
const compiled = spawnSync("clang++", [
  "-O3", "-std=c++17", join(here, "hash-worker.cpp"),
  "-I/opt/homebrew/include", "-L/opt/homebrew/lib", "-lgmp", "-o", binary,
], { encoding: "utf8" });
if (compiled.status !== 0) throw Error(compiled.stderr || "hash worker compilation failed");

const verified = spawnSync(binary, [constantsPath], {
  input: "0 77216 3744 16\n",
  encoding: "utf8",
});
if (verified.status !== 0) throw Error(verified.stderr || "hash worker self-test failed");
const result = JSON.parse(verified.stdout.trim());
if (
  result.x !== 77216 || result.y !== 3744 || result.s !== 16 ||
  !result.hits.some(([x, y, hash]) =>
    x === 77218 && y === 3751 &&
    hash === "000076784d9f3539bb6c9e535db2482d23f2daafcdd4da10516c8da759d3d4d1"
  )
) throw Error("Native MiMC result differs from the game's hash");

console.log(JSON.stringify({ binary, constantsPath, selfTest: "passed" }));
