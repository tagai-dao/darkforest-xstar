import type { LineDashPattern } from "@df/types";

const hulls = {
  light: {
    width: 22,
    silhouette: "M45 16 31 11 10 7 13 14 4 16 13 18 10 25 31 21Z",
    plating: "M40 16 15 10 20 16 15 22Z",
    canopy: "M35 16 25 13 27 16 25 19Z",
    engines: "M9 16H15",
  },
  medium: {
    width: 28,
    silhouette:
      "M45 16 32 11 26 10 14 4 5 5 10 12 4 13 4 19 10 20 5 27 14 28 26 22 32 21Z",
    plating: "M40 16 19 11 11 6 15 13 11 16 15 19 11 26 19 21Z",
    canopy: "M34 16 24 12 19 16 24 20Z",
    engines: "M6 14H13 M6 18H13",
  },
  heavy: {
    width: 34,
    silhouette:
      "M45 16 36 10 39 6 19 3 7 4 3 10 8 12 7 20 3 22 7 28 19 29 39 26 36 22Z",
    plating:
      "M41 16 30 11 35 7 18 5 11 6 17 12 12 16 17 20 11 26 18 27 35 25 30 21Z",
    canopy: "M33 16 24 12 19 13 19 19 24 20Z",
    engines: "M7 9H13 M9 16H15 M7 23H13",
  },
  capital: {
    width: 41,
    silhouette:
      "M46 16 36 11 33 7 37 4 18 2 6 5 3 10 13 11 8 14 3 14 3 18 8 18 13 21 3 22 6 27 18 30 37 28 33 25 36 21Z",
    plating:
      "M42 16 29 11 32 7 17 5 8 7 22 11 14 16 22 21 8 25 17 27 32 25 29 21Z",
    canopy: "M35 16 26 12 18 14 18 18 26 20Z",
    engines: "M7 8H14 M6 16H13 M7 24H14",
  },
  flagship: {
    width: 48,
    silhouette:
      "M46 16 36 8 41 5 27 2 15 2 4 5 2 10 9 12 5 14 2 14 2 18 5 18 9 20 2 22 4 27 15 30 27 30 41 27 36 24Z",
    plating:
      "M42 16 28 10 36 6 24 4 13 4 7 7 18 9 22 12 10 16 22 20 18 23 7 25 13 28 24 28 36 26 28 22Z",
    canopy:
      "M34 16 26 12 16 15 16 17 26 20Z M27 8 20 6 15 7 20 9Z M27 24 20 26 15 25 20 23Z",
    engines: "M6 7H11 M5 10H10 M4 16H10 M5 22H10 M6 25H11",
  },
};

export type FleetTier = keyof typeof hulls;

export const fleetRoutes: Record<
  FleetTier,
  { width: number; alpha: number; halo: number; dash?: LineDashPattern }
> = {
  light: { width: 1, alpha: 120, halo: 0 },
  medium: { width: 1, alpha: 152, halo: 0, dash: { length: 4, gap: 5 } },
  heavy: { width: 2, alpha: 146, halo: 0, dash: { length: 12, gap: 5 } },
  capital: { width: 3, alpha: 172, halo: 34, dash: { length: 22, gap: 7 } },
  flagship: { width: 4, alpha: 195, halo: 56 },
};

type FleetSprite = {
  image: HTMLCanvasElement;
  width: number;
  height: number;
};

const sprites = new Map<FleetTier, FleetSprite>();

export function getFleetTier(departureEnergy: number): FleetTier {
  if (departureEnergy >= 1_000_000) return "flagship";
  if (departureEnergy >= 100_000) return "capital";
  if (departureEnergy >= 10_000) return "heavy";
  if (departureEnergy >= 1_000) return "medium";
  return "light";
}

export function getFleetSprite(tier: FleetTier): FleetSprite | undefined {
  const cached = sprites.get(tier);
  if (cached) return cached;

  const image = document.createElement("canvas");
  image.width = 96;
  image.height = 64;
  const ctx = image.getContext("2d");
  if (!ctx) return;

  const hull = hulls[tier];
  ctx.scale(2, 2);
  ctx.lineJoin = "round";

  const silhouette = new Path2D(hull.silhouette);
  ctx.fillStyle = "#354962";
  ctx.fill(silhouette);
  ctx.strokeStyle = "#071322";
  ctx.lineWidth = 3;
  ctx.stroke(silhouette);
  ctx.strokeStyle = "#aec8df";
  ctx.lineWidth = 1.15;
  ctx.stroke(silhouette);

  const metal = ctx.createLinearGradient(0, 5, 0, 27);
  metal.addColorStop(0, "#f4faff");
  metal.addColorStop(0.48, "#b5cde3");
  metal.addColorStop(1, "#547294");
  ctx.fillStyle = metal;
  ctx.fill(new Path2D(hull.plating));
  ctx.fillStyle = "#143752";
  const canopy = new Path2D(hull.canopy);
  ctx.fill(canopy);
  ctx.strokeStyle = "#8cd7f5";
  ctx.lineWidth = 0.8;
  ctx.stroke(canopy);
  ctx.strokeStyle = "#b9f6ff";
  ctx.lineWidth = 2;
  ctx.stroke(new Path2D(hull.engines));

  const sprite = { image, width: hull.width, height: (hull.width * 2) / 3 };
  sprites.set(tier, sprite);
  return sprite;
}
