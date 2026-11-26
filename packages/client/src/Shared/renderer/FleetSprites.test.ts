import { expect, it } from "vitest";

import { fleetRoutes, getFleetTier } from "./FleetSprites";

it("increases the route width at each fleet icon energy threshold", () => {
  const tiers = [0, 1_000, 10_000, 100_000, 1_000_000].map(getFleetTier);
  expect(tiers).toEqual(["light", "medium", "heavy", "capital", "flagship"]);
  expect([999, 9_999, 99_999, 999_999].map(getFleetTier)).toEqual(
    tiers.slice(0, -1),
  );
  expect(tiers.map((tier) => fleetRoutes[tier].width)).toEqual([1, 2, 3, 4, 5]);
});
