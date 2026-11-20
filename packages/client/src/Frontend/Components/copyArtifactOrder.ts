import type { Artifact, LocatablePlanet } from "@df/types";

import type { GameUIManager } from "../../Backend/GameLogic/GameUIManager";
import {
  copyText,
  formatUseArtifactOrder,
} from "../../Backend/GameLogic/moveOrder";
import UIEmitter, { UIEmitterEvent } from "../Utils/UIEmitter";
import type { ArtifactUseChoice } from "./ownedArtifacts";

// 复制成功后弹出的提示
const COPIED: Record<ArtifactUseChoice["action"], string> = {
  charge: "已复制充能单，直接粘贴给 agent",
  activate: "已复制激活单，直接粘贴给 agent",
  shutdown: "已复制关闭单，直接粘贴给 agent",
  land: "已复制摧毁单，等到达窗口再粘贴给 agent",
};

/**
 * 生成使用神器的单子并复制到剪贴板。页面不发交易，单子交给 agent 执行。
 * @param subject 单子里要证明的星球：充能是目标，激活是炸弹所在星球，摧毁是被摧毁的星球
 */
export function copyArtifactOrder(input: {
  uiManager: GameUIManager;
  planet: LocatablePlanet;
  artifact: Artifact;
  choice: ArtifactUseChoice;
  subject?: LocatablePlanet;
}): void {
  const { uiManager, planet, artifact, choice, subject } = input;
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
}

/** 复制按钮禁用时的原因，按优先级返回：先登记垃圾配额 > 等级不符 > 没选目标 */
export function copyDisabledReason(
  junkOk: boolean,
  levelOk: boolean,
  missingTarget: boolean,
): string | undefined {
  if (!junkOk) return "先登记垃圾配额";
  if (!levelOk) return "这颗星球的等级不能用它";
  if (missingTarget) return "先选一颗目标星球";
  return undefined;
}
