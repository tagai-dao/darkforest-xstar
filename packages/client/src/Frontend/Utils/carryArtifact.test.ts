import type { LocationId } from "@df/types";
import { describe, expect, it } from "vitest";

import { planetToClearCarry } from "./carryArtifact";

const planetA = "aaa" as LocationId;
const planetB = "bbb" as LocationId;

describe("planetToClearCarry", () => {
  it("换到另一颗星球时，清掉离开的那颗", () => {
    expect(planetToClearCarry(planetA, planetB)).toBe(planetA);
  });

  it("重新选中同一颗星球时不清，否则刚点的运送会被立刻清掉", () => {
    expect(planetToClearCarry(planetA, planetA)).toBeUndefined();
  });

  it("之前没有选中任何星球时，没有可清的", () => {
    expect(planetToClearCarry(undefined, planetA)).toBeUndefined();
  });

  it("取消选中时，清掉之前那颗", () => {
    expect(planetToClearCarry(planetA, undefined)).toBe(planetA);
  });
});
