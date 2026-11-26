import { expect, it } from "vitest";

import { getInnerCircleLabelPosition } from "./UIRenderer";

it("places the inner-circle label on the visible arc when the circle center is offscreen", () => {
  const center = { x: -200, y: -300 };
  const label = getInnerCircleLabelPosition(center, 460, 800, 600);
  expect(label).toBeDefined();
  if (!label) return;
  expect(label.x).toBeGreaterThanOrEqual(42);
  expect(label.y).toBeGreaterThanOrEqual(24);
  expect(Math.hypot(label.x - center.x, label.y - center.y)).toBeCloseTo(460);
});

it("does not show a floating progress label when the ring is outside the viewport", () => {
  expect(
    getInnerCircleLabelPosition({ x: 400, y: 300 }, 1000, 800, 600),
  ).toBeUndefined();
});
