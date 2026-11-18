import bigInt, { type BigInteger } from "big-integer";

import { mimcRoundConstants } from "./mimcConstants";

export const p = bigInt(
  "21888242871839275222246405745257275088548364400416034343698204186575808495617",
);

const c = mimcRoundConstants.map((n) => bigInt(n));

class FeistelState {
  l: BigInteger;
  r: BigInteger;
  rounds: number;
  k: BigInteger;

  constructor(rounds: number, k: BigInteger) {
    this.l = bigInt(0);
    this.r = bigInt(0);
    this.rounds = rounds;
    this.k = k;
  }

  inject(elt: BigInteger): void {
    this.l = this.l.add(elt).mod(p);
  }

  mix(): void {
    for (let i = 0; i < this.rounds - 1; i++) {
      const t = this.k.add(this.l).add(c[i]).mod(p);
      const lNew = t.modPow(5, p).add(this.r).mod(p);
      this.r = this.l;
      this.l = lNew;
    }
    const t = this.k.add(this.l).mod(p);
    this.r = t.modPow(5, p).add(this.r).mod(p);
  }
}

export function mimcSponge(
  inputs: BigInteger[],
  nOutputs: number,
  rounds: number,
  key: number,
): BigInteger[] {
  const state = new FeistelState(rounds, bigInt(key));
  for (const elt of inputs) {
    state.inject(elt);
    state.mix();
  }
  const outputs: BigInteger[] = [state.l];
  for (let i = 0; i < nOutputs - 1; i++) {
    state.mix();
    outputs.push(state.l);
  }
  return outputs;
}

/**
 * Modulo a number with the LOCATION_ID_UB constant.
 * If the result is < 0, the LOCATION_ID_UB will then be added.
 *
 * @param x The number to modulo against LOCATION_ID_UB
 */
export function modPBigInt(x: number) {
  let ret = bigInt(x).mod(p);
  if (ret.lesser(bigInt(0))) {
    ret = ret.add(p);
  }
  return ret;
}

/**
 * Modulo a BigInt with the LOCATION_ID_UB constant.
 * If the result is < 0, the LOCATION_ID_UB will then be added.
 *
 * @param x The number to modulo against LOCATION_ID_UB
 */
export function modPBigIntNative(x: BigInteger) {
  let ret = x.mod(p);
  if (ret.lesser(bigInt(0))) {
    ret = ret.add(p);
  }
  return ret;
}

export const mimcWithRounds =
  (rounds: number, key: number) =>
  (...inputs: number[]) =>
    mimcSponge(
      inputs.map((n) => modPBigInt(n)),
      1,
      rounds,
      key,
    )[0];

/**
 * The primary function used to build any MiMC hashing algorithm for Dark Forest.
 *
 * @param key The key for the MiMC algorithm. Will usually be PLANETHASH_KEY, SPACETYPE_KEY, or BIOMEBASE_KEY.
 */
// 星球坐标用 1000 轮。Perlin 走 perlinRandHash，仍是 4 轮。
function mimcHash(key: number) {
  return mimcWithRounds(1000, key);
}

export const perlinRandHash = (key: number) => mimcWithRounds(4, key);

export default mimcHash;
