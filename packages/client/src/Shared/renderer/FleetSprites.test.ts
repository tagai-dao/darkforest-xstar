import { expect, it } from "vitest";

import { fleetRoutes, getFleetTier } from "./FleetSprites";

it("uses the same five energy thresholds for fleet icons and distinct route styles", () => {
  const tiers = [0, 1_000, 10_000, 100_000, 1_000_000].map(getFleetTier);
  expect(tiers).toEqual(["light", "medium", "heavy", "capital", "flagship"]);
  expect([999, 9_999, 99_999, 999_999].map(getFleetTier)).toEqual(
    tiers.slice(0, -1),
  );
  const routes = tiers.map((tier) => JSON.stringify(fleetRoutes[tier]));
  expect(new Set(routes).size).toBe(5);
});
