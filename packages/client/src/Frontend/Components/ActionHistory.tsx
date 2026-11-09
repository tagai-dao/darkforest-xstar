import { useLayoutEffect, useRef, useState } from "react";
import styled from "styled-components";

import type {
  ActionRecord,
  AiproPrice,
} from "../../Backend/Save/FileChunkSource";
import Viewport from "../Game/Viewport";

const COLLAPSED_ROWS = 3;
const EXPANDED_ROWS = 20;
const ROW_HEIGHT = 32;
const COLUMN_GAP = 8;
const HORIZONTAL_PADDING = 24;

const List = styled.div`
  position: fixed;
  left: 16px;
  bottom: 16px;
  z-index: 6;
  box-sizing: border-box;
  max-width: 80vw;
  padding: 10px 12px;
  background: rgba(0, 0, 0, 0.82);
  color: #d7ffe4;
  font-size: 12px;
  line-height: 1.5;
`;

const Scroller = styled.div<{ $rows: number; $open: boolean }>`
  max-height: ${(props) => props.$rows * ROW_HEIGHT}px;
  overflow-y: ${(props) => (props.$open ? "auto" : "hidden")};
`;

const Row = styled.div`
  box-sizing: border-box;
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: ${COLUMN_GAP}px;
  height: ${ROW_HEIGHT}px;
  align-items: center;
  border-top: 1px solid rgba(215, 255, 228, 0.15);
`;

const ActionText = styled.span`
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
`;

const CoordButton = styled.button`
  display: inline;
  padding: 0;
  background: none;
  border: none;
  color: inherit;
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
`;

const Toggle = styled.button`
  width: 100%;
  margin-top: 6px;
  padding: 4px 0;
  background: transparent;
  color: inherit;
  border: 1px solid rgba(215, 255, 228, 0.35);
  font: inherit;
  cursor: pointer;
`;

function actionLabel(action: ActionRecord): string {
  return `${action.strategy ? `${action.strategy} ` : ""}${action.action}${
    action.detail ? ` ${action.detail}` : ""
  }`;
}

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

/** 面板宽到当前最长的一行。超过屏幕 80% 的部分才省略。 */
export function actionHistoryWidth(rowWidth: number, viewport: number): number {
  return Math.ceil(Math.min(rowWidth + HORIZONTAL_PADDING, viewport * 0.8));
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

/** 钱包目录里的动作记录。新的在最后。收起只露出最新 3 条。 */
export function ActionHistory({ actions }: { actions: ActionRecord[] }) {
  const [open, setOpen] = useState(false);
  const [panelWidth, setPanelWidth] = useState<number | undefined>();
  const list = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);

  useLayoutEffect(() => {
    const box = scroller.current;
    if (!box || !followLatest.current) {
      return;
    }
    box.scrollTop = box.scrollHeight;
  }, [actions, open]);

  useLayoutEffect(() => {
    const root = list.current;
    if (!root) {
      return;
    }
    const measure = () => {
      const probe = document.createElement("span");
      probe.style.position = "absolute";
      probe.style.visibility = "hidden";
      probe.style.whiteSpace = "nowrap";
      root.appendChild(probe);
      let widest = 0;
      probe.textContent = `动作记录 ${actions.length}`;
      widest = probe.offsetWidth;
      if (actions.length === 0) {
        probe.textContent = "还没有动作。";
        widest = Math.max(widest, probe.offsetWidth);
      }
      for (const action of actions) {
        probe.textContent = formatActionTime(action.time);
        const time = probe.offsetWidth;
        probe.textContent = actionLabel(action);
        widest = Math.max(widest, time + COLUMN_GAP + probe.offsetWidth);
      }
      probe.remove();
      setPanelWidth(actionHistoryWidth(widest, window.innerWidth));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [actions]);

  return (
    <List ref={list} style={{ width: panelWidth }}>
      <div>动作记录 {actions.length}</div>
      {actions.length === 0 ? (
        <div>还没有动作。</div>
      ) : (
        <Scroller
          ref={scroller}
          $rows={open ? EXPANDED_ROWS : COLLAPSED_ROWS}
          $open={open}
          onScroll={() => {
            const box = scroller.current;
            if (!box) {
              return;
            }
            const distance =
              box.scrollHeight - box.scrollTop - box.clientHeight;
            followLatest.current = distance < 8;
          }}
        >
          {actions.map((action, index) => (
            <Row key={`${action.time ?? ""}-${action.tx ?? ""}-${index}`}>
              <span>{formatActionTime(action.time)}</span>
              <ActionText>
                {actionTextParts(actionLabel(action)).map((part, partIndex) =>
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
          ))}
        </Scroller>
      )}
      <Toggle
        type="button"
        onClick={() => {
          followLatest.current = true;
          setOpen((current) => !current);
        }}
      >
        {open ? "收起" : "展开"}
      </Toggle>
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
