import styled from "styled-components";

import type { useUIManager } from "../Utils/AppHooks";
import type { ArtifactProgress } from "./ownedArtifacts";

/** 当前 tick、每秒走多少 tick、时钟是否暂停 */
export type Clock = { tick: number; rate: number; paused: boolean };

export function readClock(
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

/** 把剩余 tick 换成人能看懂的时间。 */
export function remainText(remainingTicks: number, clock: Clock): string {
  if (remainingTicks <= 0) return "已满";
  if (clock.paused) return "时钟暂停";
  if (!Number.isFinite(clock.rate) || clock.rate <= 0) {
    return `还剩 ${Math.ceil(remainingTicks)} tick`;
  }
  const seconds = Math.ceil(remainingTicks / clock.rate);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `还剩 ${hours}小时${minutes}分`;
  if (minutes > 0) return `还剩 ${minutes}分${secs}秒`;
  return `还剩 ${secs}秒`;
}

export function ArtifactProgressMeter({
  progress,
  clock,
  label,
}: {
  progress: ArtifactProgress;
  clock: Clock;
  /** 覆盖进度条左边的文字，比如把“激活”改成更贴切的“飞行” */
  label?: string;
}) {
  const percent =
    progress.remainingTicks <= 0
      ? 100
      : Math.min(99, Math.floor(progress.ratio * 100));
  return (
    <Progress>
      <ProgressLabel>
        <span>{label ?? progress.label}</span>
        <span>
          {percent}% {remainText(progress.remainingTicks, clock)}
        </span>
      </ProgressLabel>
      <Track>
        <Fill $percent={percent} />
      </Track>
    </Progress>
  );
}

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
