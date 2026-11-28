import type { MaterialType } from "@df/types";

export function getMaterialScoreMultiplier(materialId: MaterialType): number {
  switch (materialId) {
    case 1:
      return 105;
    case 2:
      return 110;
    case 3:
      return 120;
    case 4:
      return 130;
    case 5:
      return 150;
    case 6:
      return 180;
    case 7:
      return 200;
    case 8:
      return 250;
    case 9:
      return 300;
    case 10:
      return 400;
    case 11:
      return 600;
    default:
      return 100;
  }
}
