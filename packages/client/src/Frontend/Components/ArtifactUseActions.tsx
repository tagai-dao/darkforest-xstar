import { isLocatable } from "@df/gamelogic";
import { getPlanetName } from "@df/procedural";
import type { Artifact, LocatablePlanet } from "@df/types";
import React, { useEffect, useState } from "react";
import styled from "styled-components";

import {
  copyText,
  formatUseArtifactOrder,
} from "../../Backend/GameLogic/moveOrder";
import { useAccount, useUIManager } from "../Utils/AppHooks";
import { useEmitterValue } from "../Utils/EmitterHooks";
import UIEmitter, { UIEmitterEvent } from "../Utils/UIEmitter";
import {
  artifactLevelFits,
  type ArtifactProgress,
  artifactProgress,
  type ArtifactUseChoice,
  artifactUseChoices,
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

const COPIED: Record<ArtifactUseChoice["action"], string> = {
  charge: "已复制充能单，直接粘贴给 agent",
  activate: "已复制激活单，直接粘贴给 agent",
  shutdown: "已复制关闭单，直接粘贴给 agent",
  land: "已复制摧毁单，等到达窗口再粘贴给 agent",
};

type Clock = { tick: number; rate: number; paused: boolean };

function readClock(
  uiManager: ReturnType<typeof useUIManager>,
): Clock | undefined {
  try {
    return {
      tick: uiManager.getCurrentTick(),
      rate: uiManager.getCurrentTickerRate(),
      paused: uiManager.getPaused(),
    };
  } catch {
    return undefined;
  }
}

function remainText(progress: ArtifactProgress, clock: Clock): string {
  if (progress.remainingTicks <= 0) return "已满";
  if (clock.paused) return "时钟暂停";
  if (!Number.isFinite(clock.rate) || clock.rate <= 0) {
    return `还剩 ${Math.ceil(progress.remainingTicks)} tick`;
  }
  const seconds = Math.ceil(progress.remainingTicks / clock.rate);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `还剩 ${hours}小时${minutes}分`;
  if (minutes > 0) return `还剩 ${minutes}分${secs}秒`;
  return `还剩 ${secs}秒`;
}

function ArtifactProgressMeter({
  progress,
  clock,
}: {
  progress: ArtifactProgress;
  clock: Clock;
}) {
  const percent =
    progress.remainingTicks <= 0
      ? 100
      : Math.min(99, Math.floor(progress.ratio * 100));
  return (
    <Progress>
      <ProgressLabel>
        <span>{progress.label}</span>
        <span>
          {percent}% {remainText(progress, clock)}
        </span>
      </ProgressLabel>
      <Track>
        <Fill $percent={percent} />
      </Track>
    </Progress>
  );
}

/** 点一下选中神器，再从它所在的星球拖到目标星球。和出发银是同一次拖动。 */
function CarryToggle({
  planet,
  artifact,
}: {
  planet: LocatablePlanet;
  artifact: Artifact;
}) {
  const uiManager = useUIManager();
  const account = useAccount(uiManager);
  const sending = useEmitterValue(uiManager.artifactSending$, undefined);
  const armed =
    sending?.planetId === planet.locationId &&
    sending.artifact?.id === artifact.id;
  if (!sameAddress(planet.owner, account)) return null;
  if (!sameAddress(planet.junkOwner, account)) {
    return <Note>先登记垃圾配额，才能把神器拖走</Note>;
  }
  if (artifact.status !== undefined && artifact.status >= 2) {
    if (artifact.status === 5) return null;
    return <Note>充能、待发或生效中的神器不能带走</Note>;
  }

  const toggle = () => {
    if (armed) {
      uiManager.setArtifactSending(planet.locationId, undefined);
      return;
    }
    if (sending?.planetId && sending.planetId !== planet.locationId) {
      uiManager.setArtifactSending(sending.planetId, undefined);
    }
    uiManager.setArtifactSending(planet.locationId, artifact);
    uiManager.centerPlanet(planet);
  };

  return (
    <>
      <ChoiceButton type="button" onClick={toggle}>
        {armed ? "取消运送" : "运送"}
      </ChoiceButton>
      {armed && <Note>按住这颗星球，拖到目标星球。</Note>}
    </>
  );
}

function useNote(
  junkOk: boolean,
  levelOk: boolean,
  index: number | undefined,
): string {
  if (!junkOk) return "先登记垃圾配额";
  if (!levelOk) return "这颗星球的等级不能用它";
  return USE_HINT[index ?? 0] ?? "";
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

function formatCoord(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
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
  const choices = artifactUseChoices(artifact);
  const needsTarget = choices.some((choice) => choice.needsTarget);
  const includeOthers = artifact.artifactIndex === 1;
  const targets = targetPlanets(uiManager, account, planet, includeOthers);
  const [targetId, setTargetId] = useState<string | undefined>();
  const [clock, setClock] = useState(() => readClock(uiManager));
  const chosen =
    targets.find((item) => item.locationId === targetId) ?? targets[0];
  // 充能和飞行按墙上的秒往前走，每秒读一次当前 tick。
  useEffect(() => {
    const read = () => setClock(readClock(uiManager));
    read();
    const id = window.setInterval(read, 1000);
    return () => window.clearInterval(id);
  }, [uiManager]);
  const zone =
    artifact.artifactIndex === 1
      ? uiManager.getPinkZoneByArtifactId(artifact.id)
      : undefined;
  const flight = zone
    ? { departureTick: zone.launchTick, arrivalTick: zone.arrivalTick }
    : undefined;
  const progress = clock
    ? artifactProgress(artifact, clock.tick, flight)
    : undefined;

  if (!sameAddress(planet.owner, account)) return null;
  if (choices.length === 0) {
    return (
      <Stack>
        {progress && clock && (
          <ArtifactProgressMeter progress={progress} clock={clock} />
        )}
        <Note>{artifact.status === 5 ? "已经损坏" : "还不能从这里使用"}</Note>
        <CarryToggle planet={planet} artifact={artifact} />
      </Stack>
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
    const hashConfig = uiManager.getHashConfig();
    const text = formatUseArtifactOrder({
      action: choice.action,
      planetId: planet.locationId,
      artifactId: artifact.id,
      dataKind: choice.dataKind,
      target: subject
        ? {
            id: subject.locationId,
            x: subject.location.coords.x,
            y: subject.location.coords.y,
          }
        : undefined,
      planetHashKey: hashConfig.planetHashKey,
      spaceTypeKey: hashConfig.spaceTypeKey,
      scale: hashConfig.perlinLengthScale,
      mirrorX: hashConfig.perlinMirrorX,
      mirrorY: hashConfig.perlinMirrorY,
      entryFeeWei: uiManager.getGameManager().getTransactionFee(),
    });
    void copyText(text).then((copied) => {
      UIEmitter.getInstance().emit(UIEmitterEvent.MoveOrderCopied, {
        text,
        copied,
        label: COPIED[choice.action],
      });
    });
  };

  return (
    <Stack>
      {progress && clock ? (
        <ArtifactProgressMeter progress={progress} clock={clock} />
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
        const missingTarget = choice.needsTarget && !chosen;
        return (
          <ChoiceButton
            key={`${choice.action}-${choice.dataKind}`}
            type="button"
            disabled={!junkOk || !levelOk || missingTarget}
            onClick={() => copy(choice)}
          >
            {choice.label}
          </ChoiceButton>
        );
      })}
      <Note>{useNote(junkOk, levelOk, artifact.artifactIndex)}</Note>
      <CarryToggle planet={planet} artifact={artifact} />
    </Stack>
  );
}

/** 点中的星球上如果放着神器，就在详情里给出和列表相同的使用按钮。 */
export function PlanetArtifactUse({ planet }: { planet: LocatablePlanet }) {
  const uiManager = useUIManager();
  const account = useAccount(uiManager);
  if (!sameAddress(planet.owner, account)) return null;
  if (planet.destroyed || planet.frozen) return null;
  const artifacts = (planet.heldArtifactIds ?? [])
    .map((id) => uiManager.getArtifactWithId(id))
    .filter((item): item is Artifact => !!item);
  if (artifacts.length === 0) return null;

  return (
    <Box>
      <Title>使用神器</Title>
      {artifacts.map((artifact) => (
        <Item key={artifact.id}>
          <Name>
            {ownedArtifactName(artifact.artifactIndex, artifact.artifactType)}{" "}
            {ownedArtifactRarity(artifact.rarity)}
          </Name>
          <ArtifactUseActions planet={planet} artifact={artifact} />
        </Item>
      ))}
    </Box>
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

const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 140px;
`;

const ChoiceButton = styled.button`
  height: 28px;
  color: #e8eef7;
  background: transparent;
  border: 1px solid #3d4d63;
  cursor: pointer;

  &:disabled {
    color: #6d7b8c;
    cursor: default;
  }
`;

const Target = styled.select`
  width: 100%;
  color: #e8eef7;
  background: #101820;
  border: 1px solid #3d4d63;
`;

const Note = styled.div`
  color: #9aabbe;
  font-size: 12px;
`;

const Progress = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const ProgressLabel = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: #9aabbe;
  font-size: 12px;
`;

const Track = styled.div`
  height: 8px;
  background: #1c2836;
  border: 1px solid #3d4d63;
`;

const Fill = styled.div<{ $percent: number }>`
  height: 100%;
  width: ${(props) => props.$percent}%;
  background: #7eb6ff;
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
