import { isLocatable } from "@df/gamelogic";
import { getPlanetName } from "@df/procedural";
import type { Artifact, LocatablePlanet } from "@df/types";
import { TooltipName } from "@df/types";
import React, { useEffect, useState } from "react";
import styled from "styled-components";

import type { GameUIManager } from "../../Backend/GameLogic/GameUIManager";
import { TooltipTrigger } from "../Panes/Tooltip";
import { useAccount, useUIManager } from "../Utils/AppHooks";
import {
  bombDestroyWindowOpen,
  launchedBombStillUsable,
} from "../Utils/bombPlan";
import { useEmitterValue } from "../Utils/EmitterHooks";
import { ArtifactHelp } from "./ArtifactHelp";
import { ArtifactProgressMeter, readClock } from "./ArtifactProgressMeter";
import { BombUseActions } from "./BombUseActions";
import { copyArtifactOrder, copyDisabledReason } from "./copyArtifactOrder";
import {
  artifactLevelFits,
  artifactProgress,
  type ArtifactUseChoice,
  artifactUseChoices,
  formatCoord,
  ownedArtifactName,
  ownedArtifactRarity,
} from "./ownedArtifacts";

const STATUS_LABEL = ["待用", "冷却", "充能中", "可激活", "生效中", "已损坏"];

const USE_HINT: Record<number, string> = {
  1: "先选目标再充能。激活证明的是这颗星球。摧毁单可以先复制，等到达窗口再粘贴。",
  4: "激活后能量补满，这件神器损坏。",
  5: "选另一颗自己的星球。",
  6: "先充能。满 14400 tick 后再激活。",
};

// 图标统一用 16px 线条风格，颜色跟随按钮的 currentColor
const ICON_PROPS = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

/** 充能：闪电 */
function ChargeIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
    </svg>
  );
}

/** 激活：向四周放射的火花 */
function ActivateIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
    </svg>
  );
}

/** 关闭：电源按钮 */
function ShutdownIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 2v10" />
      <path d="M6.4 5.6a9 9 0 1 0 11.2 0" />
    </svg>
  );
}

/** 摧毁：炸弹加引线 */
function LandIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="10" cy="14" r="6" />
      <path d="M14.5 9.5 18 6" />
      <path d="M18 3v3M18 6h3" />
    </svg>
  );
}

// 每种复制动作对应的图标、浮窗名称
const COPY_ICON: Record<ArtifactUseChoice["action"], () => React.ReactElement> =
  {
    charge: ChargeIcon,
    activate: ActivateIcon,
    shutdown: ShutdownIcon,
    land: LandIcon,
  };

const COPY_TOOLTIP: Record<ArtifactUseChoice["action"], TooltipName> = {
  charge: TooltipName.ArtifactCopyCharge,
  activate: TooltipName.ArtifactCopyActivate,
  shutdown: TooltipName.ArtifactCopyShutdown,
  land: TooltipName.ArtifactCopyLand,
};

/**
 * 图标按钮：悬浮时弹出和右侧卡片一样的中文浮窗。
 * 禁用时用 $disabled 样式和 aria-disabled，而不是原生 disabled，
 * 这样鼠标移上去仍能触发浮窗，把原因显示出来。
 */
function IconAction({
  name,
  label,
  icon,
  disabled = false,
  reason,
  hint,
  onClick,
}: {
  name: TooltipName;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  /** 禁用时的原因，优先显示 */
  reason?: string;
  /** 可用时的补充提示 */
  hint?: string;
  onClick: () => void;
}) {
  const extra = disabled ? reason : hint;
  return (
    <TooltipTrigger
      name={name}
      style={{ display: "inline-flex" }}
      extraContent={extra ? <Hint>{extra}</Hint> : undefined}
    >
      <IconButton
        type="button"
        aria-label={label}
        aria-disabled={disabled}
        $disabled={disabled}
        onClick={() => {
          if (!disabled) onClick();
        }}
      >
        {icon}
      </IconButton>
    </TooltipTrigger>
  );
}

/**
 * “出发时携带”复选框：用文字和勾选状态直接说明带不带。
 * 不能携带时用 aria-disabled 置灰而不是原生 disabled，悬浮仍能看到原因。
 */
function CarryCheckbox({
  checked,
  blockedReason,
  onToggle,
}: {
  checked: boolean;
  /** 不能携带的原因；没有则表示可以勾选 */
  blockedReason?: string;
  onToggle: () => void;
}) {
  const blocked = blockedReason !== undefined;
  let extra: string | undefined;
  if (blockedReason) {
    extra = blockedReason;
  } else if (checked) {
    extra = "已勾选：拖到目标星球出发时会带上这件神器。";
  }

  return (
    <TooltipTrigger
      name={TooltipName.ArtifactCarry}
      style={{ display: "inline-flex" }}
      extraContent={extra ? <Hint>{extra}</Hint> : undefined}
    >
      <CarryLabel $blocked={blocked} $checked={checked}>
        <input
          type="checkbox"
          checked={checked}
          aria-disabled={blocked}
          onChange={() => {
            if (!blocked) onToggle();
          }}
        />
        出发时携带
      </CarryLabel>
    </TooltipTrigger>
  );
}

/** 勾选后，从它所在的星球拖到目标星球的出发命令会带上这件神器。和出发银是同一次拖动。 */
function CarryToggle({
  planet,
  artifact,
}: {
  planet: LocatablePlanet;
  artifact: Artifact;
}) {
  const uiManager = useUIManager();
  const account = useAccount(uiManager);
  // 事件只用来触发重绘；是否勾选一律直接读 uiManager 里存的值。
  // 之前用“最后一次事件”判断：别的星球发一次事件就会把这里冲成未勾选，
  // 重新挂载时（还没收到事件）也会显示成未勾选，而实际上神器还记着。
  useEmitterValue(uiManager.artifactSending$, undefined);
  const sendingHere = uiManager.getArtifactSending(planet.locationId);
  const armed = sendingHere?.id === artifact.id;
  if (!sameAddress(planet.owner, account)) return null;
  // 已损坏的神器不再显示“出发时携带”
  if (artifact.status === 5) return null;

  // 不能携带的两种情况：复选框置灰，悬浮时说明原因
  let blockedReason: string | undefined;
  if (!sameAddress(planet.junkOwner, account)) {
    // 垃圾配额没登记
    blockedReason = "先登记垃圾配额，才能把神器拖走";
  } else if (artifact.status !== undefined && artifact.status >= 2) {
    // 充能、待发、生效中的神器不能带走
    blockedReason = "充能、待发或生效中的神器不能带走";
  }

  const toggle = () => {
    if (armed) {
      uiManager.setArtifactSending(planet.locationId, undefined);
      return;
    }
    uiManager.setArtifactSending(planet.locationId, artifact);
    uiManager.centerPlanet(planet);
  };

  return (
    <CarryCheckbox
      checked={armed}
      blockedReason={blockedReason}
      onToggle={toggle}
    />
  );
}

function sameAddress(left?: string, right?: string): boolean {
  if (!left || !right) return false;
  return left.toLowerCase() === right.toLowerCase();
}

function distance2(from: LocatablePlanet, to: LocatablePlanet): number {
  const dx = from.location.coords.x - to.location.coords.x;
  const dy = from.location.coords.y - to.location.coords.y;
  return dx * dx + dy * dy;
}

/**
 * 复制使用神器的单子。虫洞只列自己的星球。粉红炸弹再补上离这里最近的已知星球。
 */
export function ArtifactUseActions({
  planet,
  artifact,
}: {
  planet: LocatablePlanet;
  artifact: Artifact;
}) {
  const uiManager = useUIManager();
  const account = useAccount(uiManager);
  const [clock, setClock] = useState(() => readClock(uiManager));
  // 充能和飞行按墙上的秒往前走，每秒读一次当前 tick。
  useEffect(() => {
    const read = () => setClock(readClock(uiManager));
    read();
    const id = window.setInterval(read, 1000);
    return () => window.clearInterval(id);
  }, [uiManager]);

  // 粉红炸弹发射后状态是“已损坏”，但到达后的 300 tick 内仍可摧毁。
  // 其余时候（没发射、还在飞、窗口已过）不能摧毁，也就不该给摧毁按钮和目标列表。
  const isBomb = artifact.artifactIndex === 1;
  const nowTick = clock?.tick ?? 0;
  const bombFlight = isBomb ? uiManager.getBombFlight(artifact.id) : undefined;
  const destroyOpen = bombDestroyWindowOpen(
    bombFlight?.arrivalTick ?? 0,
    nowTick,
  );
  const choices = artifactUseChoices(artifact).filter(
    (choice) =>
      !(artifact.status === 5 && choice.action === "land" && !destroyOpen),
  );

  const needsTarget = choices.some((choice) => choice.needsTarget);
  const targets = targetPlanets(uiManager, account, planet, isBomb);
  const [targetId, setTargetId] = useState<string | undefined>();
  const chosen =
    targets.find((item) => item.locationId === targetId) ?? targets[0];

  // 飞行进度以链上的出发/到达 tick 为准
  const flight =
    bombFlight && bombFlight.arrivalTick > 0
      ? {
          departureTick: bombFlight.departureTick,
          arrivalTick: bombFlight.arrivalTick,
        }
      : undefined;
  const progress = clock
    ? artifactProgress(artifact, clock.tick, flight)
    : undefined;

  if (!sameAddress(planet.owner, account)) return null;
  if (choices.length === 0) {
    return (
      <Row>
        {progress && clock && (
          <ProgressSlot>
            <ArtifactProgressMeter progress={progress} clock={clock} />
          </ProgressSlot>
        )}
        <Note>{unusableNote(artifact.status, bombFlight, nowTick)}</Note>
        <CarryToggle planet={planet} artifact={artifact} />
      </Row>
    );
  }

  const junkOk = sameAddress(planet.junkOwner, account);
  const levelOk = artifactLevelFits(artifact, planet.planetLevel);
  const status =
    artifact.status === undefined ? "" : (STATUS_LABEL[artifact.status] ?? "");

  const copy = (choice: ArtifactUseChoice) => {
    if (!junkOk || !levelOk) return;
    // 激活粉红炸弹时证明这颗星球本身，不依赖下拉框。
    let subject: LocatablePlanet | undefined;
    if (choice.revealSelf) subject = planet;
    else if (choice.needsTarget) subject = chosen;
    if (choice.dataKind === "reveal" && !subject) return;
    copyArtifactOrder({ uiManager, planet, artifact, choice, subject });
  };

  // 所有操作放在同一行：进度/状态、目标选择、各个复制图标、运送。窄了自动换行。
  return (
    <Row>
      {progress && clock ? (
        <ProgressSlot>
          <ArtifactProgressMeter progress={progress} clock={clock} />
        </ProgressSlot>
      ) : (
        status && <Note>{status}</Note>
      )}
      {needsTarget && (
        <Target
          value={chosen?.locationId ?? ""}
          onChange={(event) => setTargetId(event.target.value)}
        >
          {targets.length === 0 ? (
            <option value="">没有可选的目标</option>
          ) : (
            targets.map((item) => (
              <option key={item.locationId} value={item.locationId}>
                {sameAddress(item.owner, account) ? "自己的 " : ""}
                {formatCoord(item.location.coords.x)},{" "}
                {formatCoord(item.location.coords.y)} {getPlanetName(item)}
              </option>
            ))
          )}
        </Target>
      )}
      {choices.map((choice) => {
        const missingTarget = Boolean(choice.needsTarget && !chosen);
        const disabled = !junkOk || !levelOk || missingTarget;
        const reason = copyDisabledReason(junkOk, levelOk, missingTarget);
        const Icon = COPY_ICON[choice.action];
        return (
          <IconAction
            key={`${choice.action}-${choice.dataKind}`}
            name={COPY_TOOLTIP[choice.action]}
            label={choice.label}
            icon={<Icon />}
            disabled={disabled}
            reason={reason}
            hint={USE_HINT[artifact.artifactIndex ?? 0]}
            onClick={() => copy(choice)}
          />
        );
      })}
      <CarryToggle planet={planet} artifact={artifact} />
    </Row>
  );
}

/** 没有可复制的单子时，告诉玩家为什么：炸弹要区分“还在飞”“窗口已过”“真的坏了”。 */
function unusableNote(
  status: number | undefined,
  bombFlight: { arrivalTick: number } | undefined,
  nowTick: number,
): string {
  if (status !== 5) return "还不能从这里使用";
  const arrival = bombFlight?.arrivalTick ?? 0;
  if (arrival > 0 && nowTick < arrival) return "飞行中，到达后才能摧毁";
  if (arrival > 0) return "摧毁窗口已过";
  return "已损坏";
}

/**
 * 已从这颗星球发射、还在飞行或摧毁窗口内的粉红炸弹。
 * 激活时合约会把炸弹从星球神器栏里移除，但仍记着它是从这颗星球出发的
 * （artifact.onPlanetId），所以要单独找出来，面板才能继续显示它的进度。
 */
function launchedBombsFrom(
  uiManager: GameUIManager,
  planet: LocatablePlanet,
): Artifact[] {
  const nowTick = readClock(uiManager)?.tick ?? 0;
  return uiManager
    .getMyArtifacts()
    .filter(
      (artifact) =>
        artifact.artifactIndex === 1 &&
        artifact.onPlanetId === planet.locationId &&
        !planet.heldArtifactIds?.includes(artifact.id) &&
        launchedBombStillUsable(
          uiManager.getBombFlight(artifact.id).arrivalTick,
          nowTick,
        ),
    );
}

/** 点中的星球上如果放着神器，就在详情里给出和列表相同的使用按钮。 */
export function PlanetArtifactUse({ planet }: { planet: LocatablePlanet }) {
  const uiManager = useUIManager();
  const account = useAccount(uiManager);
  if (!sameAddress(planet.owner, account)) return null;
  if (planet.destroyed || planet.frozen) return null;
  const held = (planet.heldArtifactIds ?? [])
    .map((id) => uiManager.getArtifactWithId(id))
    .filter((item): item is Artifact => !!item);
  const artifacts = [...held, ...launchedBombsFrom(uiManager, planet)];
  if (artifacts.length === 0) return null;

  return (
    <Box>
      <Title>使用神器</Title>
      {artifacts.map((artifact) => (
        <Item key={artifact.id}>
          <Name>
            {ownedArtifactName(artifact.artifactIndex, artifact.artifactType)}{" "}
            {ownedArtifactRarity(artifact.rarity)}
            <ArtifactHelp artifactIndex={artifact.artifactIndex} />
          </Name>
          {artifact.artifactIndex === 1 ? (
            <BombArtifactUse planet={planet} artifact={artifact} />
          ) : (
            <ArtifactUseActions planet={planet} artifact={artifact} />
          )}
        </Item>
      ))}
    </Box>
  );
}

/**
 * 粉红炸弹在星球详情里用四步面板（选目标 → 充能 → 激活 → 摧毁）。
 * 候选目标、垃圾配额、“出发时携带”开关在这里准备好，传给面板。
 */
function BombArtifactUse({
  planet,
  artifact,
}: {
  planet: LocatablePlanet;
  artifact: Artifact;
}) {
  const uiManager = useUIManager();
  const account = useAccount(uiManager);
  return (
    <BombUseActions
      planet={planet}
      artifact={artifact}
      junkOk={sameAddress(planet.junkOwner, account)}
      targets={targetPlanets(uiManager, account, planet, true)}
      carry={<CarryToggle planet={planet} artifact={artifact} />}
    />
  );
}

// 虫洞只能连自己的星球。粉红炸弹再带上最近的 40 颗已知星球，方便选落点。
function targetPlanets(
  uiManager: ReturnType<typeof useUIManager>,
  account: string | undefined,
  source: LocatablePlanet,
  includeOthers: boolean,
): LocatablePlanet[] {
  const owned = uiManager
    .getAllOwnedPlanets()
    .filter(
      (item): item is LocatablePlanet =>
        isLocatable(item) &&
        sameAddress(item.owner, account) &&
        item.locationId !== source.locationId,
    );
  if (!includeOthers) return owned;
  const seen = new Set<string>(owned.map((item) => item.locationId));
  seen.add(source.locationId);
  const others: LocatablePlanet[] = [];
  for (const item of uiManager.getGameManager().getAllPlanets()) {
    if (!isLocatable(item) || seen.has(item.locationId)) continue;
    others.push(item);
  }
  others.sort(
    (left, right) => distance2(source, left) - distance2(source, right),
  );
  return [...owned, ...others.slice(0, 40)];
}

// 操作区的一整行：自动换行，间距固定
const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
`;

// 进度条占一段弹性宽度，窄了也不会把按钮挤出去
const ProgressSlot = styled.div`
  flex: 1 1 180px;
  min-width: 0;
`;

const IconButton = styled.button<{ $disabled: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  padding: 0;
  color: ${({ $disabled }) => ($disabled ? "#6d7b8c" : "#e8eef7")};
  background: transparent;
  border: 1px solid #3d4d63;
  cursor: ${({ $disabled }) => ($disabled ? "default" : "pointer")};

  &:hover {
    border-color: ${({ $disabled }) => ($disabled ? "#3d4d63" : "#7eb6ff")};
  }
`;

// “出发时携带”：勾选后文字变亮蓝，不能勾选时整体置灰
const CarryLabel = styled.label<{ $blocked: boolean; $checked: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  font-size: 12px;
  white-space: nowrap;
  color: ${({ $blocked, $checked }) => {
    if ($blocked) return "#6d7b8c";
    return $checked ? "#7eb6ff" : "#e8eef7";
  }};
  cursor: ${({ $blocked }) => ($blocked ? "default" : "pointer")};

  input {
    margin: 0;
    accent-color: #7eb6ff;
    cursor: inherit;
  }
`;

// 浮窗里的补充说明（禁用原因或使用提示）
const Hint = styled.div`
  margin-top: 4px;
  color: #9aabbe;
  font-size: 12px;
`;

const Target = styled.select`
  flex: 1 1 160px;
  min-width: 120px;
  max-width: 240px;
  height: 28px;
  color: #e8eef7;
  background: #101820;
  border: 1px solid #3d4d63;
`;

const Note = styled.div`
  color: #9aabbe;
  font-size: 12px;
`;

const Box = styled.div`
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #3d4d63;
`;

const Title = styled.div`
  margin-bottom: 6px;
`;

const Item = styled.div`
  margin-bottom: 8px;
`;

const Name = styled.div`
  margin-bottom: 4px;
`;
