import type { MaterialType } from "@df/types";

import dfstyles from "../Styles/dfstyles";

/** 星球标签、材料面板和文档共用这一套材料颜色。 */
export function getMaterialColor(materialId: MaterialType): string {
  switch (materialId) {
    case 1:
      return "#4A90E2"; // 水晶体
    case 2:
      return "#8B4513"; // 活木
    case 3:
      return "#87CEEB"; // 风钢
    case 4:
      return "#C0C0C0"; // 极光金
    case 5:
      return "#8b55c1ff"; // 菌胶
    case 6:
      return "#FFD700"; // 沙玻璃
    case 7:
      return "#80e5f3ff"; // 冰晶石
    case 8:
      return "#696969"; // 废金
    case 9:
      return "#FF4500"; // 火钢
    case 10:
      return "#2F4F4F"; // 黑合金
    case 11:
      return "#0df000df"; // 腐化水晶
    default:
      return dfstyles.colors.subtext;
  }
}
