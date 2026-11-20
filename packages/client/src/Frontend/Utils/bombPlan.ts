import { getRange } from "@df/gamelogic";
import type { LocationId, Planet, WorldCoords } from "@df/types";

import type { ArtifactProgress } from "../Components/ownedArtifacts";

/** 合约在激活时把射程乘 50%（MULTIPLY_RANGE 50） */
export const BOMB_RANGE_MULTIPLIER = 0.5;
/** 炸弹到达后，这么多 tick 内才能摧毁 */
export const BOMB_DESTROY_WINDOW = 300;
/** 每一档稀有度的摧毁半径 */
const BLAST_RADIUS_PER_RARITY = 500;

/**
 * 以当前能量发射，炸弹最远能飞多远。
 * 合约要求：人口 > 人口上限 / 20 × 2^(距离 / 射程)，射程已减半。
 * 反过来就是：距离 < 射程 × log2(20 × 当前能量 / 能量上限)，和星球的射程圈同一个公式。
 */
export function bombReachRadius(planet: Planet): number {
  if (planet.energyCap <= 0) return 0;
  const percent = (planet.energy / planet.energyCap) * 100;
  return getRange(planet, percent, BOMB_RANGE_MULTIPLIER);
}

/** 摧毁半径：普通 500 / 稀有 1000 / 史诗 1500 / 传说 2000 / 神话 2500 */
export function bombBlastRadius(rarity: number): number {
  return Number(rarity) * BLAST_RADIUS_PER_RARITY;
}

/**
 * 目标星球以谁为准。
 * 待用或冷却时，链上的目标还没写（或是旧的），用界面上刚选的；
 * 一旦开始充能，目标已经写进链上，以链上为准，刷新页面也不会丢。
 */
export function resolveBombTarget(input: {
  status?: number;
  planTarget?: LocationId;
  chainTarget?: LocationId;
}): LocationId | undefined {
  const { status, planTarget, chainTarget } = input;
  const idle = status === undefined || status === 0 || status === 1;
  if (idle) return planTarget;
  return chainTarget ?? planTarget;
}

/**
 * 候选星球列表按坐标排序：先 x 再 y，从小到大。
 * 列表很长时，玩家记着坐标就能很快对上地图上的那颗。返回新数组，不改原数组。
 */
export function sortByCoords<T extends { location: { coords: WorldCoords } }>(
  planets: T[],
): T[] {
  return [...planets].sort(
    (left, right) =>
      left.location.coords.x - right.location.coords.x ||
      left.location.coords.y - right.location.coords.y,
  );
}

/**
 * 现在能不能摧毁：炸弹已到达，且还在到达后的 300 tick 窗口内。
 * 没发射（到达 tick 为 0）、还在飞、窗口已过，都不行。
 */
export function bombDestroyWindowOpen(
  arrivalTick: number,
  nowTick: number,
): boolean {
  return (
    arrivalTick > 0 &&
    nowTick >= arrivalTick &&
    nowTick < arrivalTick + BOMB_DESTROY_WINDOW
  );
}

/**
 * 已发射的炸弹，还要不要继续显示在出发星球的面板里。
 * 激活时合约把炸弹从星球的神器栏里移除了，但链上仍记着它从哪颗星球出发；
 * 飞行中和到达后的摧毁窗口内都还要用，窗口过了就没用了，不再占位置。
 */
export function launchedBombStillUsable(
  arrivalTick: number,
  nowTick: number,
): boolean {
  return arrivalTick > 0 && nowTick < arrivalTick + BOMB_DESTROY_WINDOW;
}

/** 炸弹现在处在哪个阶段。 */
export type BombPhase =
  | "pick" // 还没选目标
  | "charge" // 选好目标，等复制充能单
  | "charging" // 充能中
  | "launch" // 充能完，等激活
  | "flying" // 已激活，正在飞
  | "destroy" // 到达了，300 tick 摧毁窗口开着
  | "expired" // 窗口已过
  | "cooldown" // 冷却中
  | "broken"; // 已损坏，没有可用的飞行记录

export function bombPhase(input: {
  /** 链上神器状态：0 待用 1 冷却 2 充能中 3 可激活 4 生效中 5 已损坏 */
  status?: number;
  hasTarget: boolean;
  /** 链上记录的到达 tick，没发射过为 0 */
  arrivalTick: number;
  nowTick: number;
  /** 充能进度；用来判断充能时间是不是已经走完 */
  charging?: ArtifactProgress;
}): BombPhase {
  const { hasTarget, arrivalTick, nowTick, charging } = input;
  const status = input.status ?? 0;

  // 发射过：看到达时间，不再看神器状态
  if (arrivalTick > 0 && (status === 4 || status === 5)) {
    if (nowTick < arrivalTick) return "flying";
    if (nowTick < arrivalTick + BOMB_DESTROY_WINDOW) return "destroy";
    return "expired";
  }
  if (status === 5) return "broken";
  if (status === 4) return "flying";
  if (status === 3) return "launch";
  if (status === 2) {
    // 充能时间走完后，链上要有人再碰一下才会变成“可激活”，这里提前当作可激活
    const stillCharging = charging !== undefined && charging.remainingTicks > 0;
    return stillCharging ? "charging" : "launch";
  }
  if (status === 1) return "cooldown";
  return hasTarget ? "charge" : "pick";
}

export type BombStepKey = "target" | "charge" | "launch" | "destroy";
export type BombStepState = "done" | "active" | "todo" | "expired";
export type BombStep = {
  key: BombStepKey;
  label: string;
  state: BombStepState;
};

const STEP_LABELS: [BombStepKey, string][] = [
  ["target", "选目标"],
  ["charge", "充能"],
  ["launch", "激活"],
  ["destroy", "摧毁"],
];

// 每个阶段对应第几步在进行；-1 表示哪一步都不在进行（冷却中）
const ACTIVE_STEP: Record<BombPhase, number> = {
  pick: 0,
  charge: 1,
  charging: 1,
  launch: 2,
  flying: 2,
  destroy: 3,
  expired: 3,
  broken: 3,
  cooldown: -1,
};

/** 把阶段展开成四步各自的状态，界面按它画“已完成 / 进行中 / 未开始”。 */
export function bombSteps(phase: BombPhase): BombStep[] {
  const active = ACTIVE_STEP[phase];
  const failed = phase === "expired" || phase === "broken";
  return STEP_LABELS.map(([key, label], index) => {
    let state: BombStepState = "todo";
    if (index < active) state = "done";
    else if (index === active) state = failed ? "expired" : "active";
    return { key, label, state };
  });
}

/** 落在摧毁半径内的星球，离目标近的排前面。目标本身距离为 0，自然排第一。 */
export function planetsInBlast<T extends { location: { coords: WorldCoords } }>(
  planets: T[],
  center: WorldCoords,
  radius: number,
): T[] {
  const distance2 = (planet: T) =>
    (planet.location.coords.x - center.x) ** 2 +
    (planet.location.coords.y - center.y) ** 2;
  return planets
    .filter((planet) => distance2(planet) <= radius * radius)
    .sort((left, right) => distance2(left) - distance2(right));
}
