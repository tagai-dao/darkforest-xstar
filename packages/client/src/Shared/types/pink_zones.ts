import type { ArtifactId, EthAddress, LocationId } from "./identifier";
import type { WorldCoords } from "./world";
export type PinkZone = {
  locationId: LocationId;
  coords: WorldCoords;
  radius: number;
  operator: EthAddress;
  launchTick: number;
  arrivalTick: number;
  launchPlanet: LocationId;
  artifactId: ArtifactId;
};

/**
 * 玩家点了“使用神器”之后，界面上记着的粉红炸弹选择。
 * 只是界面状态：真正的目标要等充能单上链后才以链上为准。
 */
export type BombPlan = {
  /** 放着炸弹的星球 */
  planetId: LocationId;
  artifactId: ArtifactId;
  /** 正在等玩家在地图上点目标星球 */
  picking: boolean;
  targetId?: LocationId;
};

/**
 * 摧毁阶段，界面上记着的“要摧毁哪颗星球”。
 * 可以从下拉框选，也可以进入点选后在地图上点。只是界面状态，真正的单子复制时才生成。
 */
export type BombVictimPick = {
  /** 炸弹的出发星球 */
  planetId: LocationId;
  artifactId: ArtifactId;
  /** 正在等玩家在地图上点要摧毁的星球 */
  picking: boolean;
  victimId?: LocationId;
  /** 最近一次点了但不能摧毁的星球（不在范围内或已被摧毁），用来给提示 */
  rejectedId?: LocationId;
};

/** 地图上要画的炸弹预览：射程圈、炸毁线和摧毁半径圈 */
export type BombPreview = {
  /** 炸弹所在星球的坐标，射程圈和炸毁线都从这里出发 */
  from: WorldCoords;
  /** 按当前能量算出的最远射程，能量变了它跟着变 */
  reachRadius: number;
  target?: {
    coords: WorldCoords;
    /** 摧毁半径：到达后这个范围内的星球都能摧毁 */
    blastRadius: number;
    /** 炸弹星球到目标的距离 */
    distance: number;
    /** 以当前能量能不能打到 */
    inReach: boolean;
  };
};
