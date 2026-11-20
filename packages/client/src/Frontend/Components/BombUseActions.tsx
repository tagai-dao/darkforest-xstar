import { isLocatable } from "@df/gamelogic";
import { getPlanetName } from "@df/procedural";
import type { Artifact, LocatablePlanet, LocationId } from "@df/types";
import { type ReactNode, useEffect, useState } from "react";
import styled from "styled-components";

import { useUIManager } from "../Utils/AppHooks";
import {
  BOMB_DESTROY_WINDOW,
  bombBlastRadius,
  bombPhase,
  bombReachRadius,
  type BombStep,
  bombSteps,
  planetsInBlast,
  resolveBombTarget,
  sortByCoords,
} from "../Utils/bombPlan";
import { useEmitterValue } from "../Utils/EmitterHooks";
import {
  ArtifactProgressMeter,
  readClock,
  remainText,
} from "./ArtifactProgressMeter";
import { copyArtifactOrder, copyDisabledReason } from "./copyArtifactOrder";
import {
  artifactLevelFits,
  artifactProgress,
  type ArtifactUseAction,
  artifactUseChoices,
  formatCoord,
} from "./ownedArtifacts";

// 摧毁窗口剩余不到这么多 tick 时，倒计时变红提醒
const URGENT_TICKS = 60;

type Props = {
  /** 放着炸弹的星球 */
  planet: LocatablePlanet;
  artifact: Artifact;
  /** 这颗星球已登记垃圾配额。没登记不能复制链上单子 */
  junkOk: boolean;
  /** 下拉框里的候选目标：自己的星球 + 最近的已知星球 */
  targets: LocatablePlanet[];
  /** “出发时携带”复选框，由外面传入 */
  carry: ReactNode;
};

/**
 * 粉红炸弹的四步使用面板：选目标 → 充能 → 激活 → 摧毁。
 * 每一步只显示当前能做的按钮和进度；到达后 300 tick 内必须摧毁，有倒计时。
 * 地图上对应的射程圈、炸毁线、摧毁半径圈由 UIRenderer 根据同一份选择来画。
 */
export function BombUseActions({
  planet,
  artifact,
  junkOk,
  targets,
  carry,
}: Props) {
  const uiManager = useUIManager();
  const [clock, setClock] = useState(() => readClock(uiManager));

  // 充能、飞行、倒计时都按 tick 走，每秒读一次当前 tick。
  useEffect(() => {
    const read = () => setClock(readClock(uiManager));
    read();
    const id = window.setInterval(read, 1000);
    return () => window.clearInterval(id);
  }, [uiManager]);

  // 事件只用来触发重绘，具体值每次直接读 bombPlan。
  useEmitterValue(uiManager.bombPlan.changed$, undefined);
  const plan = uiManager.bombPlan.get();
  const myPlan = plan?.artifactId === artifact.id ? plan : undefined;
  const picking = myPlan?.picking === true;

  // 摧毁阶段选的受害星球，同样只把事件当重绘信号
  useEmitterValue(uiManager.bombVictim.changed$, undefined);
  const victimPick = uiManager.bombVictim.get();
  const myVictimPick =
    victimPick?.artifactId === artifact.id ? victimPick : undefined;
  const pickingVictim = myVictimPick?.picking === true;

  // 目标：待用时用界面刚选的，开始充能后以链上为准
  const flight = uiManager.getBombFlight(artifact.id);
  const targetId = resolveBombTarget({
    status: artifact.status,
    planTarget: myPlan?.targetId,
    chainTarget: flight.target,
  });
  const targetCandidate = targetId
    ? uiManager.getPlanetWithId(targetId)
    : undefined;
  const target =
    targetCandidate && isLocatable(targetCandidate)
      ? targetCandidate
      : undefined;

  const launched = flight.arrivalTick > 0;
  const progress = clock
    ? artifactProgress(
        artifact,
        clock.tick,
        launched
          ? {
              departureTick: flight.departureTick,
              arrivalTick: flight.arrivalTick,
            }
          : undefined,
      )
    : undefined;
  const phase = bombPhase({
    status: artifact.status,
    hasTarget: target !== undefined,
    arrivalTick: flight.arrivalTick,
    nowTick: clock?.tick ?? 0,
    charging: progress?.label === "充能" ? progress : undefined,
  });

  const choices = artifactUseChoices(artifact);
  const levelOk = artifactLevelFits(artifact, planet.planetLevel);
  const hasChoice = (action: ArtifactUseAction) =>
    choices.some((choice) => choice.action === action);

  // 复制一张单子。subject 是单子里要证明的那颗星球。
  const copy = (action: ArtifactUseAction, subject?: LocatablePlanet) => {
    const choice = choices.find((item) => item.action === action);
    if (!choice || !junkOk || !levelOk) return;
    if (choice.dataKind === "reveal" && !subject) return;
    copyArtifactOrder({ uiManager, planet, artifact, choice, subject });
  };

  const togglePicking = () => {
    if (picking) uiManager.bombPlan.cancelPicking();
    else uiManager.bombPlan.startPicking(planet.locationId, artifact.id);
  };
  // 用下拉框选目标，和地图点选效果一样
  const chooseFromList = (locationId: string) => {
    const chosen = targets.find((item) => item.locationId === locationId);
    if (!chosen) return;
    uiManager.bombPlan.startPicking(planet.locationId, artifact.id);
    uiManager.bombPlan.chooseTarget(chosen.locationId);
  };

  const blast = bombBlastRadius(artifact.rarity);
  // 发射后的两段倒计时：先是飞到落点，到达后才是 300 tick 的摧毁窗口
  const arrivalLeft = launched ? flight.arrivalTick - (clock?.tick ?? 0) : 0;
  const windowLeft = arrivalLeft + BOMB_DESTROY_WINDOW;

  // 摧毁：只能摧毁目标周围半径内、还没被摧毁的已知星球。
  // 按坐标（先 x 后 y）排序，方便对照地图；默认选目标本身。
  const victims = target
    ? sortByCoords(
        planetsInBlast(
          Array.from(uiManager.getGameManager().getAllPlanets()).filter(
            (item): item is LocatablePlanet =>
              isLocatable(item) && !item.destroyed,
          ),
          target.location.coords,
          blast,
        ),
      )
    : [];
  const victim =
    victims.find((item) => item.locationId === myVictimPick?.victimId) ??
    victims.find((item) => item.locationId === target?.locationId) ??
    victims[0];
  // 最近一次点了但不能摧毁的星球，用来给提示
  const rejected = myVictimPick?.rejectedId
    ? uiManager.getPlanetWithId(myVictimPick.rejectedId)
    : undefined;

  const toggleVictimPicking = () => {
    if (pickingVictim) uiManager.bombVictim.cancelPicking();
    else uiManager.bombVictim.startPicking(planet.locationId, artifact.id);
  };
  const chooseVictimFromList = (locationId: string) => {
    uiManager.bombVictim.choose(
      planet.locationId,
      artifact.id,
      locationId as LocationId,
    );
  };

  // 候选落点同样按坐标排序，已选的目标不在候选里时补进去
  const optionsForTarget = sortByCoords(
    target && !targets.some((item) => item.locationId === target.locationId)
      ? [target, ...targets]
      : targets,
  );

  return (
    <Card>
      <StepBar steps={bombSteps(phase)} />

      {(phase === "pick" || phase === "charge") && (
        <>
          <Row>
            <ActionButton
              label={pickButtonLabel(picking, target !== undefined)}
              primary={phase === "pick"}
              onClick={togglePicking}
            />
            <Select
              value={target?.locationId ?? ""}
              onChange={(event) => chooseFromList(event.target.value)}
            >
              {!target && <option value="">或从列表选目标</option>}
              {optionsForTarget.map((item) => (
                <option key={item.locationId} value={item.locationId}>
                  {uiManager.isOwnedByMe(item) ? "自己的 " : ""}
                  {formatCoord(item.location.coords.x)},{" "}
                  {formatCoord(item.location.coords.y)} {getPlanetName(item)}
                </option>
              ))}
            </Select>
          </Row>
          {picking && (
            <Note>在地图上点一颗星球作为目标。再点一次按钮取消。</Note>
          )}
          {!picking && !target && (
            <Note>
              地图上的虚线圈是当前能量能到的最远距离。点“使用神器”，再到地图上点目标。
            </Note>
          )}
        </>
      )}

      {target && phase !== "pick" && (
        <TargetInfo
          planet={planet}
          target={target}
          blast={blast}
          showReach={phase === "charge" || phase === "launch"}
        />
      )}

      {phase === "charge" && (
        <Row>
          <ActionButton
            label="复制充能"
            primary
            reason={copyDisabledReason(junkOk, levelOk, !target)}
            onClick={() => copy("charge", target)}
          />
          {(artifact.charge ?? 0) > 0 && (
            <Note>充能约需 {artifact.charge} tick</Note>
          )}
        </Row>
      )}

      {phase === "charging" && (
        <>
          {progress && clock && (
            <ArtifactProgressMeter progress={progress} clock={clock} />
          )}
          <Note>充能完成后，这里会出现“复制激活”。</Note>
        </>
      )}

      {phase === "launch" && (
        <>
          <Note>已充满。激活后炸弹起飞，射程和速度减半。</Note>
          <Row>
            <ActionButton
              label="复制激活"
              primary
              reason={copyDisabledReason(junkOk, levelOk, false)}
              onClick={() => copy("activate", planet)}
            />
          </Row>
        </>
      )}

      {phase === "flying" && (
        <>
          {progress && clock && (
            <ArtifactProgressMeter
              progress={progress}
              clock={clock}
              label="飞行"
            />
          )}
          <Countdown $urgent={false}>
            到达倒计时：{Math.max(0, arrivalLeft)} tick
            {clock ? `，${remainText(arrivalLeft, clock)}` : ""}
          </Countdown>
          <Note>
            到达后 {BOMB_DESTROY_WINDOW} tick 内必须发起摧毁，过了就作废。
          </Note>
        </>
      )}

      {phase === "destroy" && (
        <>
          <Countdown $urgent={windowLeft < URGENT_TICKS}>
            摧毁倒计时：{Math.max(0, windowLeft)} tick
            {clock ? `，${remainText(windowLeft, clock)}` : ""}
          </Countdown>
          {progress && clock && (
            <ArtifactProgressMeter progress={progress} clock={clock} />
          )}
          <Row>
            <ActionButton
              label={pickingVictim ? "取消选择" : "在地图上选"}
              onClick={toggleVictimPicking}
            />
            <Select
              value={victim?.locationId ?? ""}
              onChange={(event) => chooseVictimFromList(event.target.value)}
            >
              {victims.map((item) => (
                <option key={item.locationId} value={item.locationId}>
                  {item.locationId === target?.locationId ? "目标 " : ""}
                  {formatCoord(item.location.coords.x)},{" "}
                  {formatCoord(item.location.coords.y)} {getPlanetName(item)}
                </option>
              ))}
            </Select>
            <ActionButton
              label="复制摧毁"
              primary
              reason={copyDisabledReason(junkOk, levelOk, !victim)}
              onClick={() => copy("land", victim)}
            />
          </Row>
          {pickingVictim && (
            <Note>在地图上点一颗要摧毁的星球。再点一次按钮取消。</Note>
          )}
          {pickingVictim && rejected && (
            <Note $warn>
              {getPlanetName(rejected)} 不能摧毁：不在爆炸范围内，或已被摧毁。
            </Note>
          )}
          <Note>
            只能摧毁目标周围 {blast} 以内的星球，每颗星球只能被摧毁一次。
          </Note>
        </>
      )}

      {phase === "expired" && (
        <Note $warn>
          摧毁窗口已过（到达后 {BOMB_DESTROY_WINDOW}{" "}
          tick），这件炸弹不能再摧毁了。
        </Note>
      )}
      {phase === "broken" && <Note $warn>这件炸弹已经损坏。</Note>}
      {phase === "cooldown" && (
        <>
          {progress && clock && (
            <ArtifactProgressMeter progress={progress} clock={clock} />
          )}
          <Note>冷却中，暂时不能使用。</Note>
        </>
      )}

      <Row>
        {(phase === "charging" || phase === "launch" || phase === "flying") &&
          hasChoice("shutdown") && (
            <ActionButton
              label="复制关闭"
              reason={copyDisabledReason(junkOk, levelOk, false)}
              onClick={() => copy("shutdown")}
            />
          )}
        {carry}
      </Row>
    </Card>
  );
}

/** 选目标那个开关按钮的文字：点选中可以取消，选过目标后是重选。 */
function pickButtonLabel(picking: boolean, hasTarget: boolean): string {
  if (picking) return "取消使用";
  return hasTarget ? "重选目标" : "使用神器";
}

/** 四步条：已完成打勾，进行中高亮，没轮到的置灰。 */
function StepBar({ steps }: { steps: BombStep[] }) {
  return (
    <Steps>
      {steps.map((step, index) => (
        <StepChip key={step.key} $state={step.state}>
          {step.state === "done" ? "✓ " : ""}
          {index + 1} {step.label}
        </StepChip>
      ))}
    </Steps>
  );
}

/** 目标是谁、距离多远；充能前和激活前再给出当前能量能不能打到。 */
function TargetInfo({
  planet,
  target,
  blast,
  showReach,
}: {
  planet: LocatablePlanet;
  target: LocatablePlanet;
  blast: number;
  showReach: boolean;
}) {
  const uiManager = useUIManager();
  const distance = uiManager.getDistCoords(
    planet.location.coords,
    target.location.coords,
  );
  const reach = bombReachRadius(planet);
  const tooFar = showReach && distance > reach;
  return (
    <Info>
      <div>
        目标 {formatCoord(target.location.coords.x)},{" "}
        {formatCoord(target.location.coords.y)} {getPlanetName(target)}
      </div>
      <div>
        距离 {Math.round(distance)} · 摧毁半径 {blast}
        {showReach ? ` · 当前能量最远 ${Math.round(reach)}` : ""}
      </div>
      {tooFar && (
        <Note $warn>按当前能量打不到。等能量涨起来，或换一个更近的目标。</Note>
      )}
    </Info>
  );
}

/** 文字按钮。不可用时用 aria-disabled 置灰，悬浮仍能看到原因。 */
function ActionButton({
  label,
  reason,
  primary = false,
  onClick,
}: {
  label: string;
  /** 不可用的原因；没有则可点 */
  reason?: string;
  primary?: boolean;
  onClick: () => void;
}) {
  const disabled = reason !== undefined;
  return (
    <>
      <Button
        type="button"
        title={reason}
        aria-disabled={disabled}
        $disabled={disabled}
        $primary={primary}
        onClick={() => {
          if (!disabled) onClick();
        }}
      >
        {label}
      </Button>
      {disabled && <Note>{reason}</Note>}
    </>
  );
}

const Card = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
`;

const Steps = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
`;

const STEP_COLOR = {
  done: { color: "#6fcf97", border: "#2f6b4a", background: "transparent" },
  active: { color: "#0b1620", border: "#7eb6ff", background: "#7eb6ff" },
  todo: { color: "#6d7b8c", border: "#2a3748", background: "transparent" },
  expired: { color: "#ff6b6b", border: "#7a2f2f", background: "transparent" },
};

const StepChip = styled.span<{ $state: BombStep["state"] }>`
  padding: 1px 6px;
  font-size: 12px;
  white-space: nowrap;
  color: ${({ $state }) => STEP_COLOR[$state].color};
  background: ${({ $state }) => STEP_COLOR[$state].background};
  border: 1px solid ${({ $state }) => STEP_COLOR[$state].border};
`;

const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
`;

const Select = styled.select`
  flex: 1 1 160px;
  min-width: 120px;
  max-width: 240px;
  height: 28px;
  color: #e8eef7;
  background: #101820;
  border: 1px solid #3d4d63;
`;

const Button = styled.button<{ $disabled: boolean; $primary: boolean }>`
  flex-shrink: 0;
  height: 28px;
  padding: 0 10px;
  font-size: 12px;
  color: ${({ $disabled, $primary }) => {
    if ($disabled) return "#6d7b8c";
    return $primary ? "#0b1620" : "#e8eef7";
  }};
  background: ${({ $disabled, $primary }) =>
    $primary && !$disabled ? "#7eb6ff" : "transparent"};
  border: 1px solid
    ${({ $disabled, $primary }) =>
      $primary && !$disabled ? "#7eb6ff" : "#3d4d63"};
  cursor: ${({ $disabled }) => ($disabled ? "default" : "pointer")};
`;

const Info = styled.div`
  color: #c4d0de;
  font-size: 12px;
`;

const Note = styled.div<{ $warn?: boolean }>`
  color: ${({ $warn }) => ($warn ? "#ff6b6b" : "#9aabbe")};
  font-size: 12px;
`;

// 摧毁倒计时：快到点时变红
const Countdown = styled.div<{ $urgent: boolean }>`
  color: ${({ $urgent }) => ($urgent ? "#ff6b6b" : "#e8eef7")};
  font-size: 13px;
  font-weight: bold;
`;
