import { describe, expect, it } from "vitest";

import { shouldStartMiner } from "./shouldStartMiner";

describe("shouldStartMiner", () => {
  it("stays off while the page is only watching", () => {
    expect(
      shouldStartMiner({
        watchOnly: true,
        hasHome: true,
        playerOnChain: true,
      }),
    ).toBe(false);
  });

  it("starts after a real player has a home", () => {
    expect(
      shouldStartMiner({
        watchOnly: false,
        hasHome: true,
        playerOnChain: true,
      }),
    ).toBe(true);
  });
});
