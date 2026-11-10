import { describe, expect, it } from "vitest";

import { chooseInitialView } from "./Viewport";

describe("chooseInitialView", () => {
  const home = { x: 79942, y: 62 };
  const stored = {
    widthInWorldUnits: 240,
    centerWorldCoords: { x: 1200, y: -400 },
  };

  it("uses the saved view when one exists", () => {
    expect(chooseInitialView(stored, home)).toBe("stored");
  });

  it("returns to home only when nothing was saved", () => {
    expect(chooseInitialView(undefined, home)).toBe("home");
  });

  it("does not treat the origin as a home", () => {
    expect(chooseInitialView(undefined, { x: 0, y: 0 })).toBe("planet");
  });
});
