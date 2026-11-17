import { describe, expect, it } from "vitest";

import { displayHandle, displayMetric } from "./homeLeaderboard";

const ADDRESS = "0x8153c8c8ef6d9e7e7ee11333f33048835325add0";

describe("home leaderboard labels", () => {
  it("shows the Binance handle when one is registered", () => {
    expect(displayHandle(ADDRESS, "alice")).toBe("alice");
  });

  it("shortens the address when the handle is blank", () => {
    expect(displayHandle(ADDRESS, "  ")).toBe("0x8153…add0");
  });

  it("shows chain score in page units", () => {
    expect(displayMetric("1400000")).toBe("1,400");
  });
});
