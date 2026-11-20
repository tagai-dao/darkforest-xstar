import { isLocatable } from "@df/gamelogic";
import type { Artifact, Planet } from "@df/types";

export type OwnedArtifactLine = {
  id: string;
  name: string;
  rarity: string;
  place: string;
  // 在某颗已知星球上时才有，弹窗里用来把镜头移过去。
  planetId?: string;
};

const ARTIFACT_NAME: Record<number, string> = {
  1: "粉红炸弹",
  4: "布隆过滤器",
  5: "虫洞",
  6: "火炮",
};

const RARITY_NAME = ["未知", "普通", "稀有", "史诗", "传说", "神话"];

export function ownedArtifactName(
  index: number | undefined,
  type: number,
): string {
  if (index !== undefined && ARTIFACT_NAME[index]) {
    return ARTIFACT_NAME[index];
  }
  if (type === 13) return "粉红炸弹";
  if (type === 8) return "布隆过滤器";
  if (type === 5) return "虫洞";
  if (type === 7) return "火炮";
  return "神器";
}

export function ownedArtifactRarity(rarity: number): string {
  return RARITY_NAME[rarity] ?? "未知";
}

export type ArtifactUseAction = "charge" | "activate" | "shutdown" | "land";
export type ArtifactUseData = "empty" | "wormhole" | "reveal";

export type ArtifactUseChoice = {
  action: ArtifactUseAction;
  dataKind: ArtifactUseData;
  label: string;
  needsTarget: boolean;
  // 粉红炸弹激活时，证明的是放着炸弹的这颗星球，不是下拉框里的目标。
  revealSelf: boolean;
};

const BLOOM_BANDS: [number, number][] = [
  [0, 3],
  [3, 5],
  [5, 7],
  [7, 9],
  [9, 10],
];
const BOMB_HIGH = [5, 6, 7, 9, 10];

/**
 * 合约把可用等级写进 reqLevel：低字节是下限（含），高字节是上限（不含）。
 * 元数据还没到时，按四种神器的安装表判断。
 */
export function artifactLevelFits(
  artifact: { artifactIndex?: number; rarity: number; reqLevel?: number },
  level: number,
): boolean {
  const req = artifact.reqLevel ?? 0;
  if (req > 0) {
    const low = req & 0xff;
    const high = (req >> 8) & 0xff;
    return level >= low && (high === 0 || level < high);
  }
  const rarity = Number(artifact.rarity);
  if (artifact.artifactIndex === 4) {
    const band = BLOOM_BANDS[rarity - 1];
    return !!band && level >= band[0] && level < band[1];
  }
  if (artifact.artifactIndex === 1) {
    const high = BOMB_HIGH[rarity - 1];
    return high !== undefined && level >= 4 && level < high;
  }
  return true;
}

export type ArtifactProgress = {
  label: "充能" | "激活" | "冷却" | "摧毁窗口";
  // 0 到 1。1 表示这段时间已经走完。
  ratio: number;
  remainingTicks: number;
};

const DESTROY_WINDOW = 300;

function progressStep(
  done: number,
  total: number,
): { ratio: number; remainingTicks: number } | undefined {
  if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) {
    return undefined;
  }
  const remainingTicks = Math.max(0, total - done);
  const ratio = Math.min(1, Math.max(0, done / total));
  return { ratio, remainingTicks };
}

/**
 * 充能、冷却、粉红炸弹飞行和到达后的摧毁窗口。
 * 飞行优先：炸弹离开发射星之后，看的是激活这段，不再看充能。
 */
export function artifactProgress(
  artifact: {
    status?: number;
    chargeTick?: number;
    charge?: number;
    cooldownTick?: number;
    cooldown?: number;
  },
  nowTick: number,
  flight?: { departureTick: number; arrivalTick: number },
): ArtifactProgress | undefined {
  if (flight && flight.arrivalTick > flight.departureTick) {
    if (nowTick < flight.arrivalTick) {
      const step = progressStep(
        nowTick - flight.departureTick,
        flight.arrivalTick - flight.departureTick,
      );
      if (step) return { label: "激活", ...step };
    } else if (nowTick < flight.arrivalTick + DESTROY_WINDOW) {
      const step = progressStep(nowTick - flight.arrivalTick, DESTROY_WINDOW);
      if (step) return { label: "摧毁窗口", ...step };
    }
  }
  if (artifact.status === 2 && (artifact.charge ?? 0) > 0) {
    const step = progressStep(
      nowTick - (artifact.chargeTick ?? 0),
      artifact.charge ?? 0,
    );
    if (step) return { label: "充能", ...step };
  }
  if (artifact.status === 1 && (artifact.cooldown ?? 0) > 0) {
    const step = progressStep(
      nowTick - (artifact.cooldownTick ?? 0),
      artifact.cooldown ?? 0,
    );
    if (step) return { label: "冷却", ...step };
  }
  return undefined;
}

// 按链上状态决定现在能复制哪几张单。充能中也给出激活，到点后链上会自己变成可激活。
export function artifactUseChoices(artifact: {
  artifactIndex?: number;
  status?: number;
}): ArtifactUseChoice[] {
  const index = artifact.artifactIndex;
  const status = artifact.status;
  if (index !== 1 && index !== 4 && index !== 5 && index !== 6) return [];
  if (status === 5) {
    return index === 1
      ? [
          {
            action: "land",
            dataKind: "reveal",
            label: "复制摧毁",
            needsTarget: true,
            revealSelf: false,
          },
        ]
      : [];
  }
  const choices: ArtifactUseChoice[] = [];
  const chargeable = index === 1 || index === 6;
  if (chargeable && (status === undefined || status === 0)) {
    choices.push({
      action: "charge",
      dataKind: index === 1 ? "reveal" : "empty",
      label: "复制充能",
      needsTarget: index === 1,
      revealSelf: false,
    });
  }
  const canActivate =
    status === undefined ||
    status === 2 ||
    status === 3 ||
    (status === 0 && !chargeable);
  if (canActivate) {
    if (index === 4 || index === 6) {
      choices.push({
        action: "activate",
        dataKind: "empty",
        label: "复制激活",
        needsTarget: false,
        revealSelf: false,
      });
    } else if (index === 5 && status !== 4) {
      choices.push({
        action: "activate",
        dataKind: "wormhole",
        label: "复制激活",
        needsTarget: true,
        revealSelf: false,
      });
    } else if (index === 1 && status !== 0) {
      choices.push({
        action: "activate",
        dataKind: "reveal",
        label: "复制激活",
        needsTarget: false,
        revealSelf: true,
      });
    }
  }
  const canShutdown =
    (index === 1 || index === 5 || index === 6) &&
    (status === undefined || status === 2 || status === 3 || status === 4);
  if (canShutdown) {
    choices.push({
      action: "shutdown",
      dataKind: "empty",
      label: "复制关闭",
      needsTarget: false,
      revealSelf: false,
    });
  }
  if (index === 1) {
    choices.push({
      action: "land",
      dataKind: "reveal",
      label: "复制摧毁",
      needsTarget: true,
      revealSelf: false,
    });
  }
  return choices;
}

export function formatCoord(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

function artifactPlace(planet: Planet | undefined, onPlanet: boolean): string {
  if (!onPlanet) return "在钱包";
  if (planet && isLocatable(planet)) {
    const { x, y } = planet.location.coords;
    return `(${formatCoord(x)}, ${formatCoord(y)})`;
  }
  return "在星球上";
}

// 先记星球上的，再补钱包里的。同一件只出现一次。
export function collectOwnedArtifacts(
  held: Planet[],
  lookup: (id: Artifact["id"]) => Artifact | undefined,
  wallet: Artifact[],
  planetById: (id: NonNullable<Artifact["onPlanetId"]>) => Planet | undefined,
  account: string,
): OwnedArtifactLine[] {
  const lines: OwnedArtifactLine[] = [];
  const seen = new Set<string>();
  const push = (
    id: string,
    artifact: Artifact | undefined,
    planet: Planet | undefined,
    onPlanet: boolean,
  ) => {
    if (seen.has(id)) return;
    const owner = artifact?.currentOwner?.toLowerCase();
    const controller = artifact?.controller?.toLowerCase();
    if (!onPlanet && owner !== account && controller !== account) return;
    seen.add(id);
    const where =
      planet ??
      (artifact?.onPlanetId ? planetById(artifact.onPlanetId) : undefined);
    const line: OwnedArtifactLine = {
      id,
      name: artifact
        ? ownedArtifactName(artifact.artifactIndex, artifact.artifactType)
        : "神器",
      rarity: artifact ? ownedArtifactRarity(artifact.rarity) : "",
      place: artifactPlace(where, onPlanet || !!artifact?.onPlanetId),
    };
    if (where?.locationId) {
      line.planetId = String(where.locationId);
    }
    lines.push(line);
  };

  for (const planet of held) {
    for (const artifactId of planet.heldArtifactIds ?? []) {
      push(String(artifactId), lookup(artifactId), planet, true);
    }
  }
  for (const artifact of wallet) {
    push(String(artifact.id), artifact, undefined, false);
  }
  return lines;
}
