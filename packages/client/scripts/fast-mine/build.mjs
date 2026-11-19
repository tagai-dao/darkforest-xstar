import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const client = resolve(here, "../..");
const source = readFileSync(join(client, "src/Shared/hashing/mimcConstants.ts"), "utf8");
const constants = [...source.matchAll(/"(\d+)"/g)].map((match) => match[1]);
if (constants.length !== 999) throw Error("Expected 999 MiMC constants");

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
  input: "0 73616 -34400 16\n",
  encoding: "utf8",
});
if (verified.status !== 0) throw Error(verified.stderr || "hash worker self-test failed");
const result = JSON.parse(verified.stdout.trim());
if (
  result.x !== 73616 || result.y !== -34400 || result.s !== 16 ||
  !result.hits.some(([x, y, hash]) =>
    x === 73622 && y === -34385 &&
    hash === "0000b3abe4d13534c7b4aa5884f7a09f6063522e6b4b297a3e9ad5d6f3d4ff08"
  )
) throw Error("Native MiMC result differs from the game's hash");

console.log(JSON.stringify({ binary, constantsPath, selfTest: "passed" }));
