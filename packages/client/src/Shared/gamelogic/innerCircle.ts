const INITIAL_INNER_RADIUS = 75_000;

export function getInnerCircleShrinkPercent(radius: number): number {
  return Math.min(100, Math.max(0, (1 - radius / INITIAL_INNER_RADIUS) * 100));
}
