import { describe, expect, it, vi } from "vitest";

import UIEmitter, { UIEmitterEvent } from "../Utils/UIEmitter";
import { bindCanvasPointerEvents } from "./canvasPointerEvents";

function withPointer(
  run: (test: {
    press: () => void;
    release: (x: number, y: number) => void;
    coverCanvas: () => void;
    mouseUp: ReturnType<typeof vi.fn>;
    mouseOut: ReturnType<typeof vi.fn>;
  }) => void,
) {
  const panel = { closest: () => null };
  let covered = false;
  const canvas = Object.assign(new EventTarget(), {
    getBoundingClientRect: () => ({ left: 10, top: 20 }),
    ownerDocument: {
      elementsFromPoint: () => (covered ? [panel] : [canvas]),
    },
    closest: () => null,
    setPointerCapture: vi.fn(),
  });
  const removeListeners = bindCanvasPointerEvents(
    canvas as unknown as HTMLCanvasElement,
  );
  const emitter = UIEmitter.getInstance();
  const mouseUp = vi.fn();
  const mouseOut = vi.fn();
  emitter.on(UIEmitterEvent.CanvasMouseUp, mouseUp);
  emitter.on(UIEmitterEvent.CanvasMouseOut, mouseOut);

  const send = (name: string, clientX: number, clientY: number) => {
    const event = Object.assign(new Event(name), {
      pointerId: 1,
      isPrimary: true,
      button: 0,
      clientX,
      clientY,
    });
    canvas.dispatchEvent(event);
  };

  try {
    run({
      press: () => send("pointerdown", 35, 55),
      release: (x, y) => send("pointerup", x, y),
      coverCanvas: () => {
        covered = true;
      },
      mouseUp,
      mouseOut,
    });
  } finally {
    emitter.off(UIEmitterEvent.CanvasMouseUp, mouseUp);
    emitter.off(UIEmitterEvent.CanvasMouseOut, mouseOut);
    removeListeners();
  }
}

describe("map pointer release", () => {
  it("selects the original point when a panel appears before click release", () => {
    withPointer(({ press, release, coverCanvas, mouseUp, mouseOut }) => {
      press();
      coverCanvas();
      release(36, 56);

      expect(mouseUp).toHaveBeenCalledExactlyOnceWith({ x: 25, y: 35 });
      expect(mouseOut).not.toHaveBeenCalled();
    });
  });

  it("keeps the release coordinates for a drag on the map", () => {
    withPointer(({ press, release, mouseUp }) => {
      press();
      release(85, 95);

      expect(mouseUp).toHaveBeenCalledExactlyOnceWith({ x: 75, y: 75 });
    });
  });

  it("cancels a drag released over a game panel", () => {
    withPointer(({ press, release, coverCanvas, mouseUp, mouseOut }) => {
      press();
      coverCanvas();
      release(85, 95);

      expect(mouseUp).not.toHaveBeenCalled();
      expect(mouseOut).toHaveBeenCalledTimes(1);
    });
  });
});
