import { describe, expect, it } from "vitest";

import {
  displayMetric,
  displayPlayerName,
  shortAddress,
} from "./homeLeaderboard";

const ADDRESS = "0x8153c8c8ef6d9e7e7ee11333f33048835325add0";

describe("home leaderboard labels", () => {
  it("shows only the player name on the home list", () => {
    expect(displayPlayerName(ADDRESS, "alice")).toBe("alice");
  });

  it("falls back to a short address when the handle is blank", () => {
    expect(displayPlayerName(ADDRESS, "  ")).toBe("0x8153…add0");
    expect(shortAddress(ADDRESS)).toBe("0x8153…add0");
  });

  it("shows chain score in page units", () => {
    expect(displayMetric("1400000")).toBe("1,400");
  });
});
