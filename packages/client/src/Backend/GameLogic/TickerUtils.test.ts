import type { ClientComponents } from "@mud/createClientComponents";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TickerUtils } from "./TickerUtils";

vi.mock("@latticexyz/recs", () => ({
  getComponentValue: (component: unknown) => component,
}));
vi.mock("@latticexyz/store-sync/recs", () => ({
  singletonEntity: "singleton",
}));

afterEach(() => vi.restoreAllMocks());

describe("TickerUtils", () => {
  it("reaches the arrival tick when chain time is ahead of the browser", () => {
    vi.spyOn(Date, "now").mockReturnValue(100_000);
    const ticker = {
      tickRate: 20,
      tickNumber: 500,
      timestamp: 7290,
      paused: false,
    };
    const clock = new TickerUtils({
      components: {
        Ticker: ticker,
        getChainClockOffsetMs: () => 7_200_000,
      } as unknown as ClientComponents,
    });

    expect(clock.getCurrentTick()).toBe(700);
    expect(clock.convertTickToMs(700)).toBe(100_000);
    expect(clock.convertMsToTick(100_000)).toBe(700);

    ticker.paused = true;
    expect(clock.getCurrentTick()).toBe(500);
  });
});
