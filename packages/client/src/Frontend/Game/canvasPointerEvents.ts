import UIEmitter, { UIEmitterEvent } from "../Utils/UIEmitter";

export function bindCanvasPointerEvents(canvas: HTMLCanvasElement) {
  const emitter = UIEmitter.getInstance();
  let activePointer: number | undefined;

  const emitPosition = (name: UIEmitterEvent, event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    emitter.emit(name, {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
  };

  const pointerDown = (event: PointerEvent) => {
    if (!event.isPrimary || event.button !== 0) return;
    activePointer = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    emitPosition(UIEmitterEvent.CanvasMouseDown, event);
  };
  const pointerMove = (event: PointerEvent) => {
    if (event.isPrimary) emitPosition(UIEmitterEvent.CanvasMouseMove, event);
  };
  const pointerUp = (event: PointerEvent) => {
    if (activePointer !== event.pointerId) return;
    activePointer = undefined;
    // 拖过引导按钮也能继续拉线。松手时保留游戏面板自己的命中范围。
    const target = canvas.ownerDocument
      .elementsFromPoint(event.clientX, event.clientY)
      .find((element) => !element.closest("[data-game-guide]"));
    if (target === canvas) {
      emitPosition(UIEmitterEvent.CanvasMouseUp, event);
    } else {
      emitter.emit(UIEmitterEvent.CanvasMouseOut);
    }
  };
  const pointerLeave = (event: PointerEvent) => {
    if (activePointer === undefined && event.isPrimary)
      emitter.emit(UIEmitterEvent.CanvasMouseOut);
  };
  const cancelPointer = (event: PointerEvent) => {
    if (activePointer !== event.pointerId) return;
    activePointer = undefined;
    emitter.emit(UIEmitterEvent.CanvasMouseOut);
  };

  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerup", pointerUp);
  canvas.addEventListener("pointerleave", pointerLeave);
  canvas.addEventListener("pointercancel", cancelPointer);
  canvas.addEventListener("lostpointercapture", cancelPointer);
  return () => {
    canvas.removeEventListener("pointerdown", pointerDown);
    canvas.removeEventListener("pointermove", pointerMove);
    canvas.removeEventListener("pointerup", pointerUp);
    canvas.removeEventListener("pointerleave", pointerLeave);
    canvas.removeEventListener("pointercancel", cancelPointer);
    canvas.removeEventListener("lostpointercapture", cancelPointer);
  };
}
