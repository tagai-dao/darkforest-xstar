import { CONTRACT_PRECISION } from "@df/constants";
import { modPBigInt } from "@df/hashing";
import {
  artifactIdToDecStr,
  locationIdToDecStr,
  locationIdToHexStr,
} from "@df/serde";
import type { ArtifactId, LocationId } from "@df/types";

export type MoveOrderMaterial = {
  materialId: number;
  materialAmount: number;
};

export type MoveOrderInput = {
  fromId: LocationId;
  toId: LocationId;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  worldRadius: number;
  // 页面上的能量和银。写进单子时再乘 1000，变成链上数量。
  forces: number;
  silver: number;
  artifactId?: ArtifactId;
  abandoning: boolean;
  materials: MoveOrderMaterial[];
  planetHashKey: number;
  spaceTypeKey: number;
  scale: number;
  mirrorX: boolean;
  mirrorY: boolean;
  entryFeeWei: bigint;
};

export type MoveOrder = {
  kind: "darkforest-move";
  call: "df__move";
  fromHash: string;
  toHash: string;
  fromHashHex: string;
  toHashHex: string;
  population: string;
  silver: string;
  artifactId: string;
  entryFeeWei: string;
  materials: { resourceId: number; amount: string }[];
  circuit: {
    x1: string;
    y1: string;
    x2: string;
    y2: string;
    r: string;
    distMax: string;
    PLANETHASH_KEY: string;
    SPACETYPE_KEY: string;
    SCALE: string;
    xMirror: string;
    yMirror: string;
    targetDistFromOriginSquare: string;
  };
};

// 拖动只生成这一张单。agent 用 circuit 原样证明，再用 population 和 silver 发 df__move。
export function buildMoveOrder(input: MoveOrderInput): MoveOrder {
  const xDiff = input.toX - input.fromX;
  const yDiff = input.toY - input.fromY;
  const distMax = Math.ceil(Math.sqrt(xDiff ** 2 + yDiff ** 2));
  const population = input.abandoning ? 0 : input.forces * CONTRACT_PRECISION;
  const silver = input.abandoning ? 0 : input.silver * CONTRACT_PRECISION;

  return {
    kind: "darkforest-move",
    call: "df__move",
    fromHash: locationIdToDecStr(input.fromId),
    toHash: locationIdToDecStr(input.toId),
    fromHashHex: locationIdToHexStr(input.fromId).slice(2),
    toHashHex: locationIdToHexStr(input.toId).slice(2),
    population: String(population),
    silver: String(silver),
    artifactId: input.artifactId ? artifactIdToDecStr(input.artifactId) : "0",
    entryFeeWei: input.entryFeeWei.toString(),
    materials: input.materials.map((material) => ({
      resourceId: Number(material.materialId) & 0xff,
      amount: String(
        Math.floor(Number(material.materialAmount) * CONTRACT_PRECISION),
      ),
    })),
    circuit: {
      x1: modPBigInt(input.fromX).toString(),
      y1: modPBigInt(input.fromY).toString(),
      x2: modPBigInt(input.toX).toString(),
      y2: modPBigInt(input.toY).toString(),
      r: String(input.worldRadius),
      distMax: String(distMax),
      PLANETHASH_KEY: String(input.planetHashKey),
      SPACETYPE_KEY: String(input.spaceTypeKey),
      SCALE: String(input.scale),
      xMirror: input.mirrorX ? "1" : "0",
      yMirror: input.mirrorY ? "1" : "0",
      targetDistFromOriginSquare: String(input.toX ** 2 + input.toY ** 2),
    },
  };
}

export function formatMoveOrder(input: MoveOrderInput): string {
  return `DARKFOREST_MOVE\n${JSON.stringify(buildMoveOrder(input))}`;
}

export type WithdrawMaterialOrderInput = {
  planetId: LocationId;
  materialType: number;
  // 页面上的材料数量。写进单子时再乘 1000。
  displayAmount: number;
  entryFeeWei: bigint;
};

// 时空裂隙把材料换成分数。agent 读到后直接调用 df__withdrawMaterial。
export function formatWithdrawMaterialOrder(
  input: WithdrawMaterialOrderInput,
): string {
  const order = {
    kind: "darkforest-withdraw-material",
    call: "df__withdrawMaterial",
    planetHash: locationIdToDecStr(input.planetId),
    planetHashHex: locationIdToHexStr(input.planetId).slice(2),
    materialType: input.materialType & 0xff,
    amount: String(Math.floor(input.displayAmount) * CONTRACT_PRECISION),
    entryFeeWei: input.entryFeeWei.toString(),
  };
  return `DARKFOREST_WITHDRAW_MATERIAL\n${JSON.stringify(order)}`;
}

export type WithdrawSilverOrderInput = {
  planetId: LocationId;
  // 页面上的银。写进单子时再乘 1000。
  displayAmount: number;
  entryFeeWei: bigint;
};

// 时空裂隙把银换成质押分数。agent 读到后直接调用 df__withdrawSilver。
export function formatWithdrawSilverOrder(
  input: WithdrawSilverOrderInput,
): string {
  const order = {
    kind: "darkforest-withdraw-silver",
    call: "df__withdrawSilver",
    planetHash: locationIdToDecStr(input.planetId),
    planetHashHex: locationIdToHexStr(input.planetId).slice(2),
    amount: String(Math.floor(input.displayAmount) * CONTRACT_PRECISION),
    entryFeeWei: input.entryFeeWei.toString(),
  };
  return `DARKFOREST_WITHDRAW_SILVER\n${JSON.stringify(order)}`;
}

export type BuySilverOrderInput = {
  planetId: LocationId;
  tier: number;
  // 折扣后的整枚 AIPRO，以及对应的 wei。银是页面数量。
  priceWhole: number;
  priceWei: bigint;
  silverDisplay: number;
  paymentToken: string;
  buySilverSystem: string;
  entryFeeWei: bigint;
};

// 购买一档银。agent 读到后先授权，再调用 df__buySilver。
export function formatBuySilverOrder(input: BuySilverOrderInput): string {
  const order = {
    kind: "darkforest-buy-silver",
    call: "df__buySilver",
    planetHash: locationIdToDecStr(input.planetId),
    planetHashHex: locationIdToHexStr(input.planetId).slice(2),
    tier: input.tier,
    priceWhole: String(input.priceWhole),
    priceWei: input.priceWei.toString(),
    silverDisplay: String(input.silverDisplay),
    paymentToken: input.paymentToken,
    buySilverSystem: input.buySilverSystem,
    entryFeeWei: input.entryFeeWei.toString(),
  };
  return `DARKFOREST_BUY_SILVER\n${JSON.stringify(order)}`;
}

export type UpgradeOrderInput = {
  planetId: LocationId;
  // 这次要加的等级，不是升完后的总数。
  rangeTimes: number;
  speedTimes: number;
  defenseTimes: number;
  entryFeeWei: bigint;
};

// 给星球升一档。agent 读到后直接调用 df__upgradePlanet。
export function formatUpgradeOrder(input: UpgradeOrderInput): string {
  const order = {
    kind: "darkforest-upgrade",
    call: "df__upgradePlanet",
    planetHash: locationIdToDecStr(input.planetId),
    planetHashHex: locationIdToHexStr(input.planetId).slice(2),
    rangeTimes: input.rangeTimes,
    speedTimes: input.speedTimes,
    defenseTimes: input.defenseTimes,
    entryFeeWei: input.entryFeeWei.toString(),
  };
  return `DARKFOREST_UPGRADE\n${JSON.stringify(order)}`;
}

export type AddJunkOrderInput = {
  planetId: LocationId;
  x: number;
  y: number;
  // 这颗星球坐标上的 biomebase。证明的第二个公开信号必须等于它。
  biomebase: number;
  planetHashKey: number;
  biomebaseKey: number;
  scale: number;
  mirrorX: boolean;
  mirrorY: boolean;
  entryFeeWei: bigint;
};

// 占领后登记垃圾配额。agent 读到后证明，再调用 df__addJunk。
export function formatAddJunkOrder(input: AddJunkOrderInput): string {
  const order = {
    kind: "darkforest-add-junk",
    call: "df__addJunk",
    planetHash: locationIdToDecStr(input.planetId),
    planetHashHex: locationIdToHexStr(input.planetId).slice(2),
    biomebase: String(input.biomebase),
    entryFeeWei: input.entryFeeWei.toString(),
    circuit: {
      x: modPBigInt(input.x).toString(),
      y: modPBigInt(input.y).toString(),
      PLANETHASH_KEY: String(input.planetHashKey),
      BIOMEBASE_KEY: String(input.biomebaseKey),
      SCALE: String(input.scale),
      xMirror: input.mirrorX ? "1" : "0",
      yMirror: input.mirrorY ? "1" : "0",
    },
  };
  return `DARKFOREST_ADD_JUNK\n${JSON.stringify(order)}`;
}

export type ClearJunkOrderInput = {
  planetId: LocationId;
  // 调用者同时是星球主人时，清除会把星球放弃。
  ownsPlanet: boolean;
  entryFeeWei: bigint;
};

export type FindArtifactOrderInput = {
  planetId: LocationId;
  x: number;
  y: number;
  biomebase: number;
  planetHashKey: number;
  biomebaseKey: number;
  scale: number;
  mirrorX: boolean;
  mirrorY: boolean;
  // find：窗口还开着，只发现。prospect-then-find：先勘探，上链后再发现。
  phase: "find" | "prospect-then-find";
  entryFeeWei: bigint;
};

// 铸造厂获得神器。agent 按 phase 勘探，再用和登记相同的证明调用 df__findingArtifact。
export function formatFindArtifactOrder(input: FindArtifactOrderInput): string {
  const order = {
    kind: "darkforest-find-artifact",
    call: "df__findingArtifact",
    prospectCall: "df__prospectPlanet",
    phase: input.phase,
    planetHash: locationIdToDecStr(input.planetId),
    planetHashHex: locationIdToHexStr(input.planetId).slice(2),
    biomebase: String(input.biomebase),
    entryFeeWei: input.entryFeeWei.toString(),
    circuit: {
      x: modPBigInt(input.x).toString(),
      y: modPBigInt(input.y).toString(),
      PLANETHASH_KEY: String(input.planetHashKey),
      BIOMEBASE_KEY: String(input.biomebaseKey),
      SCALE: String(input.scale),
      xMirror: input.mirrorX ? "1" : "0",
      yMirror: input.mirrorY ? "1" : "0",
    },
  };
  return `DARKFOREST_FIND_ARTIFACT\n${JSON.stringify(order)}`;
}

export type UseArtifactAction = "charge" | "activate" | "shutdown" | "land";
export type UseArtifactDataKind = "empty" | "wormhole" | "reveal";

export type UseArtifactOrderInput = {
  action: UseArtifactAction;
  planetId: LocationId;
  artifactId: ArtifactId;
  dataKind: UseArtifactDataKind;
  // reveal 时是被证明的星球。wormhole 时是另一端。land 的目标就是被摧毁的那颗。
  target?: { id: LocationId; x: number; y: number };
  planetHashKey: number;
  spaceTypeKey: number;
  scale: number;
  mirrorX: boolean;
  mirrorY: boolean;
  entryFeeWei: bigint;
};

const USE_CALL = {
  charge: "df__chargeArtifact",
  activate: "df__activateArtifact",
  shutdown: "df__shutdownArtifact",
  land: "destroy",
} as const;

// 使用神器。充能、激活、关闭走 df__，摧毁走粉红炸弹代理。页面只复制，不签名。
export function formatUseArtifactOrder(input: UseArtifactOrderInput): string {
  const order: Record<string, unknown> = {
    kind: "darkforest-use-artifact",
    action: input.action,
    call: USE_CALL[input.action],
    planetHash: locationIdToDecStr(input.planetId),
    planetHashHex: locationIdToHexStr(input.planetId).slice(2),
    artifactId: artifactIdToDecStr(input.artifactId),
    dataKind: input.dataKind,
    // 摧毁不收进入费。其余三次调用附上进入费。
    valueWei: input.action === "land" ? "0" : input.entryFeeWei.toString(),
  };
  if (input.action === "land") {
    order.namespace = "atf.1";
    order.system = "ProxySystem";
  }
  if (
    input.target &&
    (input.dataKind === "wormhole" || input.dataKind === "reveal")
  ) {
    order.targetHash = locationIdToDecStr(input.target.id);
    order.targetHashHex = locationIdToHexStr(input.target.id).slice(2);
  }
  if (input.dataKind === "reveal" && input.target) {
    order.revealPlanetHash = locationIdToDecStr(input.target.id);
    order.circuit = {
      x: modPBigInt(input.target.x).toString(),
      y: modPBigInt(input.target.y).toString(),
      PLANETHASH_KEY: String(input.planetHashKey),
      SPACETYPE_KEY: String(input.spaceTypeKey),
      SCALE: String(input.scale),
      xMirror: input.mirrorX ? "1" : "0",
      yMirror: input.mirrorY ? "1" : "0",
    };
  }
  return `DARKFOREST_USE_ARTIFACT\n${JSON.stringify(order)}`;
}

// 领取买银注入的游戏奖励。agent 读到后调用池子的 claimExternalRewards，不附带 ETH。
export function formatClaimRewardsOrder(input: {
  pool: string;
  pendingWei: bigint;
}): string {
  const order = {
    kind: "darkforest-claim-rewards",
    call: "claimExternalRewards",
    pool: input.pool,
    pendingWei: input.pendingWei.toString(),
    valueWei: "0",
  };
  return `DARKFOREST_CLAIM_REWARDS\n${JSON.stringify(order)}`;
}

// 领取社区按小时释放的奖励。agent 读到后调用社区的 withdrawPoolsRewards，不附带 ETH。
export function formatClaimCommunityOrder(input: {
  community: string;
  pool: string;
  pendingWei: bigint;
}): string {
  const order = {
    kind: "darkforest-claim-community",
    call: "withdrawPoolsRewards",
    community: input.community,
    pool: input.pool,
    pendingWei: input.pendingWei.toString(),
    valueWei: "0",
  };
  return `DARKFOREST_CLAIM_COMMUNITY\n${JSON.stringify(order)}`;
}

// 取消还在前半程的舰队。agent 读到后调用 df__revertMove。
export function formatRevertMoveOrder(input: {
  moveId: string;
  toPlanetId: LocationId;
  entryFeeWei: bigint;
}): string {
  const order = {
    kind: "darkforest-revert-move",
    call: "df__revertMove",
    moveId: input.moveId,
    toPlanetHash: locationIdToDecStr(input.toPlanetId),
    toPlanetHashHex: locationIdToHexStr(input.toPlanetId).slice(2),
    entryFeeWei: input.entryFeeWei.toString(),
  };
  return `DARKFOREST_REVERT_MOVE\n${JSON.stringify(order)}`;
}

// 合约用存储的 tick：已飞时间不到全程的一半才能取消。
export function revertStillInFirstHalf(
  departureTick: number,
  arrivalTick: number,
  nowTick: number,
): boolean {
  const span = arrivalTick - departureTick;
  if (span <= 0) return false;
  return nowTick - departureTick < span / 2;
}

// 清除自己名下的垃圾配额。agent 读到后直接调用 df__clearJunk。
export function formatClearJunkOrder(input: ClearJunkOrderInput): string {
  const order = {
    kind: "darkforest-clear-junk",
    call: "df__clearJunk",
    planetHash: locationIdToDecStr(input.planetId),
    planetHashHex: locationIdToHexStr(input.planetId).slice(2),
    ownsPlanet: input.ownsPlanet,
    entryFeeWei: input.entryFeeWei.toString(),
  };
  return `DARKFOREST_CLEAR_JUNK\n${JSON.stringify(order)}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "true");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.append(area);
      area.select();
      const copied = document.execCommand("copy");
      area.remove();
      return copied;
    } catch {
      return false;
    }
  }
}
