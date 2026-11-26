import type { CanvasCoords } from "@df/types";

import { distL2 } from "../../Backend/Utils/Coordinates";
import UIEmitter, { UIEmitterEvent } from "../Utils/UIEmitter";

export function bindCanvasPointerEvents(canvas: HTMLCanvasElement) {
  const view = canvas.ownerDocument.defaultView;
  if (!view) return () => undefined;

  const emitter = UIEmitter.getInstance();
  let activePointer: { id: number; start: CanvasCoords } | undefined;

  const position = (event: PointerEvent): CanvasCoords => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const pointerDown = (event: PointerEvent) => {
    if (!event.isPrimary || event.button !== 0) return;
    const start = position(event);
    activePointer = { id: event.pointerId, start };
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // 捕获失败时，仍由窗口接收这次手势的移动与松手。
    }
    emitter.emit(UIEmitterEvent.CanvasMouseDown, start);
  };
  const pointerMove = (event: PointerEvent) => {
    if (
      event.isPrimary &&
      (event.target === canvas || activePointer?.id === event.pointerId)
    ) {
      emitter.emit(UIEmitterEvent.CanvasMouseMove, position(event));
    }
  };
  const pointerUp = (event: PointerEvent) => {
    if (activePointer?.id !== event.pointerId) return;
    const { start } = activePointer;
    activePointer = undefined;
    const end = position(event);
    // 点选用按下时的坐标，保留 Viewport 的点击容差。浮层在松手前重绘也不取消点选。
    if (distL2(start, end) < 3) {
      emitter.emit(UIEmitterEvent.CanvasMouseUp, start);
      return;
    }
    // 拖过引导按钮也能继续拉线。松手时保留游戏面板自己的命中范围。
    const target = canvas.ownerDocument
      .elementsFromPoint(event.clientX, event.clientY)
      .find((element) => !element.closest("[data-game-guide]"));
    if (target === canvas) {
      emitter.emit(UIEmitterEvent.CanvasMouseUp, end);
    } else {
      emitter.emit(UIEmitterEvent.CanvasMouseOut);
    }
  };
  const pointerLeave = (event: PointerEvent) => {
    if (activePointer === undefined && event.isPrimary)
      emitter.emit(UIEmitterEvent.CanvasMouseOut);
  };
  const resetPointer = () => {
    if (!activePointer) return;
    activePointer = undefined;
    emitter.emit(UIEmitterEvent.CanvasMouseOut);
  };
  const cancelPointer = (event: PointerEvent) => {
    if (activePointer?.id === event.pointerId) resetPointer();
  };

  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointerleave", pointerLeave);
  view.addEventListener("pointermove", pointerMove, true);
  view.addEventListener("pointerup", pointerUp, true);
  view.addEventListener("pointercancel", cancelPointer, true);
  view.addEventListener("blur", resetPointer);
  return () => {
    canvas.removeEventListener("pointerdown", pointerDown);
    canvas.removeEventListener("pointerleave", pointerLeave);
    view.removeEventListener("pointermove", pointerMove, true);
    view.removeEventListener("pointerup", pointerUp, true);
    view.removeEventListener("pointercancel", cancelPointer, true);
    view.removeEventListener("blur", resetPointer);
    resetPointer();
  };
}
