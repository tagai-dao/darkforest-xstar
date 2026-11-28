import type { CanvasCoords, Chunk } from "@df/types";
import {
  type ChangeEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import styled from "styled-components";

import type { GameManager } from "../../Backend/GameLogic/GameManager";
import type { GameId } from "../../Backend/Save/GameSave";
import {
  type MapBounds,
  maxSharedMapBytes,
  MIN_CHUNK_SIZE,
  parseSharedMap,
  serializeSharedMap,
  sharedChunksInBounds,
  sharedMapBounds,
} from "../../Backend/Save/SharedMap";
import {
  GameToolbarButton,
  GameToolbarLink,
} from "../Components/GameToolbarButton";
import Viewport from "./Viewport";

const Tools = styled.div`
  position: absolute;
  top: 12px;
  left: 16px;
  z-index: 6;
  display: flex;
  align-items: flex-start;
  flex-direction: column;
  gap: 6px;
  max-width: calc(100% - 32px);
  pointer-events: none;
`;

const Buttons = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;

  & > * {
    pointer-events: auto;
  }
`;

const ExportButton = styled(GameToolbarButton)`
  border-color: #59a7cf;
  background: #194767;

  &:hover:not(:disabled) {
    background: #235a7d;
  }
`;

const Notice = styled.div`
  max-width: 340px;
  border: 1px solid #385470;
  border-radius: 5px;
  padding: 6px 9px;
  background: rgb(10 20 35 / 96%);
  color: #cadff3;
  font:
    13px/1.5 system-ui,
    "PingFang SC",
    sans-serif;
`;

const DragSurface = styled.div`
  position: absolute;
  inset: 0;
  z-index: 5;
  cursor: crosshair;
  touch-action: none;
`;

const SelectionBox = styled.div`
  position: absolute;
  pointer-events: none;
  box-sizing: border-box;
  border: 1px solid #8ce0ff;
  background: rgb(70 175 236 / 13%);
  box-shadow: inset 0 0 0 1px rgb(38 113 163 / 55%);
`;

type Drag = { pointerId: number; start: CanvasCoords; end: CanvasCoords };
type Selection = {
  bounds: MapBounds;
  start: CanvasCoords;
  end: CanvasCoords;
  chunks: Chunk[];
};

function canvasPoint(event: PointerEvent<HTMLDivElement>): CanvasCoords {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
    y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
  };
}

export function MapShareTools({
  children,
  game,
  manager,
  mapReady,
  onReturnHome,
  onSelectionChange,
}: {
  children: ReactNode;
  game: GameId;
  manager: Pick<GameManager, "chunksNear" | "importSharedChunks">;
  mapReady: boolean;
  onReturnHome?: () => void;
  onSelectionChange: (selecting: boolean) => void;
}) {
  const [selecting, setSelecting] = useState(false);
  const [selection, setSelection] = useState<Selection>();
  const [dragBox, setDragBox] = useState<Drag>();
  const [notice, setNotice] = useState("");
  const [importing, setImporting] = useState(false);
  const drag = useRef<Drag>();
  const input = useRef<HTMLInputElement>(null);

  const clearDrag = () => {
    drag.current = undefined;
    setDragBox(undefined);
  };

  useEffect(() => {
    onSelectionChange(selecting);
    if (!selecting) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setSelecting(false);
      setSelection(undefined);
      setNotice("");
      drag.current = undefined;
      setDragBox(undefined);
    };
    window.addEventListener("keydown", cancel);
    return () => {
      window.removeEventListener("keydown", cancel);
      onSelectionChange(false);
    };
  }, [onSelectionChange, selecting]);

  const beginDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    const point = canvasPoint(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, start: point, end: point };
    setDragBox(drag.current);
    setNotice("");
    setSelection(undefined);
  };

  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = { ...drag.current, end: canvasPoint(event) };
    setDragBox(drag.current);
  };

  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    const start = drag.current.start;
    const end = canvasPoint(event);
    clearDrag();
    if (Math.abs(start.x - end.x) < 4 || Math.abs(start.y - end.y) < 4) return;
    const viewport = Viewport.getInstance();
    const bounds = sharedMapBounds(
      viewport.canvasToWorldCoords(start),
      viewport.canvasToWorldCoords(end),
    );
    if (bounds.left >= bounds.right || bounds.bottom >= bounds.top) {
      setNotice(
        `选区需要至少包含一个完整的 ${MIN_CHUNK_SIZE} × ${MIN_CHUNK_SIZE} 地图区块。`,
      );
      return;
    }
    const { left, bottom, right, top } = bounds;
    const chunks = sharedChunksInBounds(
      manager.chunksNear(left, bottom, right, top),
      bounds,
    );
    setSelection({
      bounds,
      chunks,
      start: viewport.worldToCanvasCoords({ x: left, y: top }),
      end: viewport.worldToCanvasCoords({ x: right, y: bottom }),
    });
    setNotice(
      chunks.length
        ? `选中 ${chunks.length} 个已探索区块，可直接导出。`
        : "选区内没有已探索的区块。",
    );
  };

  const exportMap = () => {
    if (!selection?.chunks.length) return;
    const file = new Blob([serializeSharedMap(game, selection.chunks)], {
      type: "application/json",
    });
    if (file.size > maxSharedMapBytes) {
      setNotice("地图文件太大，请缩小选区后重试。");
      return;
    }
    const { left, bottom } = selection.bounds;
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = `darkforest-map-${left}-${bottom}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setSelecting(false);
    setSelection(undefined);
    setNotice("已导出地图文件。");
  };

  const importMap = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (file.size > maxSharedMapBytes) {
      setNotice("地图文件太大，请让对方缩小选区后重新导出。");
      return;
    }

    setImporting(true);
    setNotice("正在读取地图…");
    try {
      const chunks = parseSharedMap(await file.text(), game);
      const added = await manager.importSharedChunks(chunks);
      setNotice(
        added.chunks
          ? `已补充 ${added.chunks} 个区块，包含 ${added.planets} 个星球位置。`
          : "文件中的区域已经探索过了。",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "无法导入这份地图。");
    } finally {
      setImporting(false);
    }
  };

  const box = dragBox ?? selection;
  return (
    <>
      {selecting && (
        <DragSurface
          aria-label="地图分享选区"
          onPointerDown={beginDrag}
          onPointerMove={moveDrag}
          onPointerUp={finishDrag}
          onPointerCancel={clearDrag}
          onLostPointerCapture={clearDrag}
          onContextMenu={(event) => event.preventDefault()}
        >
          {box && (
            <SelectionBox
              style={{
                left: Math.min(box.start.x, box.end.x),
                top: Math.min(box.start.y, box.end.y),
                width: Math.abs(box.start.x - box.end.x),
                height: Math.abs(box.start.y - box.end.y),
              }}
            />
          )}
        </DragSurface>
      )}
      <Tools role="group" aria-label="游戏导航与地图工具">
        <Buttons>
          {onReturnHome && (
            <GameToolbarButton type="button" onClick={onReturnHome}>
              返回首页
            </GameToolbarButton>
          )}
          <GameToolbarLink to="/docs/overview">文档</GameToolbarLink>
          {selecting && (
            <>
              <ExportButton
                type="button"
                disabled={!selection?.chunks.length}
                onClick={exportMap}
              >
                导出地图
              </ExportButton>
              <GameToolbarButton
                type="button"
                onClick={() => {
                  clearDrag();
                  setSelecting(false);
                  setSelection(undefined);
                  setNotice("");
                }}
              >
                取消
              </GameToolbarButton>
            </>
          )}
          {!selecting && mapReady && (
            <>
              <GameToolbarButton
                type="button"
                disabled={importing}
                onClick={() => {
                  setNotice("");
                  setSelecting(true);
                }}
              >
                分享地图
              </GameToolbarButton>
              <GameToolbarButton
                type="button"
                disabled={importing}
                onClick={() => input.current?.click()}
              >
                导入地图
              </GameToolbarButton>
            </>
          )}
        </Buttons>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          aria-label="选择地图文件"
          hidden
          onChange={(event) => void importMap(event)}
        />
        {(notice || selecting) && (
          <Notice role="status" aria-live="polite">
            {notice ||
              `拖动鼠标框选地图，边缘按 ${MIN_CHUNK_SIZE} 单位区块向内对齐。`}
          </Notice>
        )}
        <div hidden={selecting}>{children}</div>
      </Tools>
    </>
  );
}
