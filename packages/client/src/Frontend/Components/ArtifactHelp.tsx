import { TooltipName } from "@df/types";
import styled from "styled-components";

import { TooltipTrigger } from "../Panes/Tooltip";

// 神器编号 -> 说明浮窗。编号和 ownedArtifacts.ts 里的 ARTIFACT_NAME 一致。
const HELP_TOOLTIP: Record<number, TooltipName> = {
  1: TooltipName.ArtifactHelpPinkBomb,
  4: TooltipName.ArtifactHelpBloomFilter,
  5: TooltipName.ArtifactHelpWormhole,
  6: TooltipName.ArtifactHelpCannon,
};

/**
 * 神器名称后面的“？”图标。
 * 鼠标悬浮时弹出这件神器的作用和用法；不认识的神器编号不显示图标。
 */
export function ArtifactHelp({ artifactIndex }: { artifactIndex?: number }) {
  const name =
    artifactIndex === undefined ? undefined : HELP_TOOLTIP[artifactIndex];
  if (!name) return null;

  return (
    <TooltipTrigger
      name={name}
      style={{ display: "inline-flex", verticalAlign: "middle" }}
    >
      <HelpBadge role="img" aria-label="神器的作用和用法">
        <svg
          width={14}
          height={14}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <path d="M12 17h.01" />
        </svg>
      </HelpBadge>
    </TooltipTrigger>
  );
}

const HelpBadge = styled.span`
  display: inline-flex;
  align-items: center;
  margin-left: 4px;
  color: #9aabbe;
  cursor: help;

  &:hover {
    color: #e8eef7;
  }
`;
