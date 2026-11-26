import { useId, useLayoutEffect, useRef, useState } from "react";
import styled from "styled-components";

import type {
  ActionRecord,
  AiproPrice,
} from "../../Backend/Save/FileChunkSource";
import Viewport from "../Game/Viewport";

const COLLAPSED_ROWS = 3;

const List = styled.section<{ $open: boolean }>`
  position: fixed;
  left: 16px;
  bottom: 16px;
  z-index: 6;
  box-sizing: border-box;
  width: min(${({ $open }) => ($open ? 700 : 540)}px, calc(100vw - 32px));
  overflow: hidden;
  background: linear-gradient(155deg, rgb(19 32 51 / 97%), rgb(10 17 29 / 97%));
  color: #dce8f6;
  border: 1px solid #2b4058;
  border-radius: 9px;
  box-shadow: 0 12px 32px rgb(2 5 12 / 36%);
  font:
    12px / 1.55 system-ui,
    "PingFang SC",
    sans-serif;
  font-variant-numeric: tabular-nums;

  @media (min-width: 760px) {
    max-width: calc(100vw - 370px);
  }
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 12px;
  border-bottom: 1px solid #28394e;
`;

const Title = styled.h2`
  margin: 0;
  color: #f0f6ff;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
`;

const Count = styled.span`
  color: #90a6be;
`;

const Toggle = styled.button<{ $open: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-left: auto;
  padding: 2px 8px;
  color: #b3e9ff;
  background: #162a40;
  border: 1px solid #2d4a66;
  border-radius: 5px;
  font: inherit;
  cursor: pointer;

  &::after {
    content: "";
    width: 5px;
    height: 5px;
    border-right: 1px solid currentColor;
    border-bottom: 1px solid currentColor;
    transform: rotate(${({ $open }) => ($open ? 45 : 225)}deg);
  }

  &:hover {
    background: #203b55;
    color: #e9faff;
  }

  &:focus-visible {
    outline: 2px solid #83d9ff;
    outline-offset: 2px;
  }
`;

const Scroller = styled.div<{ $open: boolean }>`
  max-height: ${({ $open }) => ($open ? "min(46dvh, 520px)" : "none")};
  overflow-y: ${({ $open }) => ($open ? "auto" : "hidden")};
  scrollbar-width: thin;
  scrollbar-color: #3a536e transparent;
  overscroll-behavior: contain;
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  align-items: baseline;
  gap: 8px;
  min-height: 34px;
  padding: 7px 12px;
  box-sizing: border-box;

  & + & {
    border-top: 1px solid rgb(125 163 203 / 14%);
  }

  &:hover,
  &:focus-within {
    background: rgb(114 168 219 / 8%);
  }

  @media (max-width: 480px) {
    grid-template-columns: minmax(0, 1fr);
    gap: 2px;
  }
`;

const DateLabel = styled.span`
  color: #94a9c1;
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ActionText = styled.div<{ $open: boolean }>`
  min-width: 0;
  overflow-wrap: anywhere;
  ${({ $open }) =>
    !$open &&
    `
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    `}
`;

const actionTone = {
  navigation: "#9bdefa",
  resources: "#f2cf8d",
  development: "#c6b6ff",
  neutral: "#b3c7dd",
};

const ActionType = styled.span<{ $tone: keyof typeof actionTone }>`
  padding: 2px 6px;
  margin-right: 6px;
  border-radius: 4px;
  background: rgb(133 173 220 / 13%);
  color: ${({ $tone }) => actionTone[$tone]};
  font-weight: 650;
`;

const Strategy = styled.span`
  margin-right: 6px;
  color: #9fb2c9;
`;

const CoordButton = styled.button`
  display: inline;
  padding: 0 2px;
  background: rgb(97 184 231 / 11%);
  border: none;
  border-radius: 3px;
  color: #a6e4ff;
  font: inherit;
  white-space: nowrap;
  cursor: pointer;

  &:hover {
    background: rgb(97 184 231 / 25%);
  }

  &:focus-visible {
    outline: 1px solid #83d9ff;
    outline-offset: 1px;
  }
`;

const Empty = styled.p`
  margin: 0;
  padding: 9px 12px;
  color: #a0b3cb;
`;

const actionTypes = new Map<string, [string, keyof typeof actionTone]>([
  ["spawn", ["出生", "navigation"]],
  ["move", ["舰队出航", "navigation"]],
  ["revert-move", ["召回舰队", "navigation"]],
  ["upgrade", ["升级星球", "development"]],
  ["add-junk", ["登记额度", "development"]],
  ["clear-junk", ["清除占用", "development"]],
  ["buy-junk", ["扩充额度", "resources"]],
  ["buy-silver", ["购买银", "resources"]],
  ["withdraw-silver", ["提取银", "resources"]],
  ["withdraw-material", ["提取材料", "resources"]],
  ["claim", ["领取游戏奖励", "resources"]],
  ["claim-community", ["领取社区奖励", "resources"]],
  ["prospect", ["勘探", "development"]],
  ["find-artifact", ["寻找神器", "development"]],
  ["charge-artifact", ["充能神器", "development"]],
  ["activate-artifact", ["激活神器", "development"]],
  ["shutdown-artifact", ["关闭神器", "development"]],
  ["land-bomb", ["投放炸弹", "development"]],
  ["switch-strategy", ["切换策略", "neutral"]],
]);

export type ActionTextPart =
  | { kind: "text"; value: string }
  | { kind: "coord"; x: number; y: number; label: string };

/** 把一行动作说明拆成普通文字和可点击的坐标。坐标形如 (79942, 62)。 */
export function actionTextParts(text: string): ActionTextPart[] {
  const coordinate = /\((-?\d+),\s*(-?\d+)\)/g;
  const parts: ActionTextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(coordinate)) {
    const index = match.index ?? 0;
    if (index > last) {
      parts.push({ kind: "text", value: text.slice(last, index) });
    }
    parts.push({
      kind: "coord",
      x: Number(match[1]),
      y: Number(match[2]),
      label: match[0],
    });
    last = index + match[0].length;
  }
  if (last < text.length) {
    parts.push({ kind: "text", value: text.slice(last) });
  }
  return parts;
}

function focusCoordinate(x: number, y: number): void {
  try {
    // 只移动中心，不改当前缩放。
    Viewport.getInstance().focus({ x, y });
  } catch {
    // 画面还没建好。
  }
}

/** 记录里的 time 是 ISO 字符串。页面上显示成本地的月日和时间。 */
export function formatActionTime(time: string | undefined): string {
  if (!time) {
    return "时间未知";
  }
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) {
    return time;
  }
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** 收起时只渲染最新三条。展开后保留完整记录。 */
export function ActionHistory({ actions }: { actions: ActionRecord[] }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const listId = useId();
  const scroller = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const startIndex = open ? 0 : Math.max(0, actions.length - COLLAPSED_ROWS);
  const visibleActions = open ? actions : actions.slice(startIndex);

  useLayoutEffect(() => {
    const box = scroller.current;
    if (open && box && followLatest.current) {
      box.scrollTop = box.scrollHeight;
    }
  }, [actions, open]);

  return (
    <List $open={open} aria-labelledby={titleId}>
      <Header>
        <Title id={titleId}>动作记录</Title>
        <Count>{actions.length} 条</Count>
        {actions.length > COLLAPSED_ROWS && (
          <Toggle
            type="button"
            $open={open}
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => {
              followLatest.current = true;
              setOpen((current) => !current);
            }}
          >
            {open ? "收起" : "展开"}
          </Toggle>
        )}
      </Header>
      {actions.length === 0 ? (
        <Empty>暂无动作记录</Empty>
      ) : (
        <Scroller
          id={listId}
          ref={scroller}
          $open={open}
          onScroll={({ currentTarget }) => {
            if (open) {
              const { scrollHeight, scrollTop, clientHeight } = currentTarget;
              followLatest.current =
                scrollHeight - scrollTop - clientHeight < 8;
            }
          }}
        >
          {visibleActions.map((action, index) => {
            const [label, tone] =
              actionTypes.get(action.action) ??
              ([action.action, "neutral"] as const);
            return (
              <Row key={startIndex + index}>
                <DateLabel title={action.time}>
                  {formatActionTime(action.time)}
                </DateLabel>
                <ActionText
                  $open={open}
                  title={open ? undefined : action.detail}
                >
                  <ActionType $tone={tone} title={action.action}>
                    {label}
                  </ActionType>
                  {action.strategy && <Strategy>{action.strategy}</Strategy>}
                  {actionTextParts(action.detail ?? "").map(
                    (part, partIndex) =>
                      part.kind === "text" ? (
                        <span key={partIndex}>{part.value}</span>
                      ) : (
                        <CoordButton
                          key={partIndex}
                          type="button"
                          onClick={() => focusCoordinate(part.x, part.y)}
                        >
                          {part.label}
                        </CoordButton>
                      ),
                  )}
                </ActionText>
              </Row>
            );
          })}
        </Scroller>
      )}
    </List>
  );
}

export function aiproPriceLabel(text: string | undefined): string {
  if (!text) {
    return "价格未接入";
  }
  try {
    const price = JSON.parse(text) as AiproPrice;
    if (typeof price.price === "number" && Number.isFinite(price.price)) {
      return String(price.price);
    }
  } catch {
    // 半截文件不当成价格。
  }
  return "价格未接入";
}
