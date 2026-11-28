import { Renderer } from "@df/renderer";
import { CursorState, ModalManagerEvent, Setting } from "@df/types";
import { useMUD } from "@mud/MUDContext";
// import * as fabric from 'fabric'; // v6
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import styled from "styled-components";

import type { RendererGameContext } from "../../Shared/renderer/Renderer";
import { useUIManager } from "../Utils/AppHooks";
import { useIsDown } from "../Utils/KeyEmitters";
import {
  MOVE_DOWN,
  MOVE_LEFT,
  MOVE_RIGHT,
  MOVE_UP,
} from "../Utils/ShortcutConstants";
import UIEmitter, { UIEmitterEvent } from "../Utils/UIEmitter";
import { bindCanvasPointerEvents } from "./canvasPointerEvents";
import { MapShareTools } from "./MapShareTools";
import Viewport from "./Viewport";

const CanvasWrapper = styled.div`
  width: 100%;
  height: 100%;

  position: relative;
  background:
    radial-gradient(
      ellipse at 50% 43%,
      transparent 22%,
      rgb(4 8 19 / 64%) 100%
    ),
    linear-gradient(rgb(6 12 24 / 31%), rgb(6 12 24 / 56%)),
    url("/lobby-starfield.webp") center / cover no-repeat #080e1d;

  canvas {
    width: 100%;
    height: 100%;

    position: absolute;

    &:not([data-guide-map]) {
      pointer-events: none;
    }

    &#buffer {
      width: auto;
      height: auto;
      display: none;
    }
  }
  // TODO put this into a global style
  canvas,
  img {
    image-rendering: -moz-crisp-edges;
    image-rendering: -webkit-crisp-edges;
    image-rendering: pixelated;
    image-rendering: crisp-edges;
  }
`;

export default function ControllableCanvas({
  children,
  onInputReadyChange,
  onReturnHome,
}: {
  children: ReactNode;
  onInputReadyChange?: (ready: boolean) => void;
  onReturnHome?: () => void;
}) {
  // html canvas element width and height. viewport dimensions are tracked by viewport obj
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<HTMLCanvasElement | null>(null);
  const bufferRef = useRef<HTMLCanvasElement | null>(null);
  const initializedRef = useRef(false);

  const evtRef = canvasRef;

  // const [fCanvas, setFCanvas] = useState<fabric.Canvas | null>(null);

  const gameUIManager = useUIManager();
  const { network } = useMUD();
  const [sharingMap, setSharingMap] = useState(false);
  const [inputReady, setInputReady] = useState(false);

  const modalManager = gameUIManager.getModalManager();
  const [targeting, setTargeting] = useState<boolean>(false);

  useEffect(() => {
    const updateTargeting = (newstate: CursorState) => {
      setTargeting(newstate === CursorState.TargetingExplorer);
    };
    modalManager.on(ModalManagerEvent.StateChanged, updateTargeting);
    return () => {
      modalManager.removeListener(
        ModalManagerEvent.StateChanged,
        updateTargeting,
      );
    };
  }, [modalManager]);

  const doResize = useCallback(() => {
    if (wrapperRef.current) {
      const nextWidth = wrapperRef.current.clientWidth;
      const nextHeight = wrapperRef.current.clientHeight;

      if (nextWidth <= 0 || nextHeight <= 0) {
        return;
      }

      setWidth((currentWidth) =>
        currentWidth === nextWidth ? currentWidth : nextWidth,
      );
      setHeight((currentHeight) =>
        currentHeight === nextHeight ? currentHeight : nextHeight,
      );
    }
  }, []);

  useLayoutEffect(() => {
    doResize();
  }, [doResize]);

  useEffect(() => {
    if (!wrapperRef.current || typeof ResizeObserver === "undefined") {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      doResize();
    });

    resizeObserver.observe(wrapperRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [doResize]);

  useEffect(() => {
    if (!initializedRef.current || width <= 0 || height <= 0) {
      return;
    }

    const uiEmitter: UIEmitter = UIEmitter.getInstance();
    const frameId = window.requestAnimationFrame(() => {
      uiEmitter.emit(UIEmitterEvent.WindowResize);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [width, height]);

  const canInitialize = Boolean(gameUIManager) && width > 0 && height > 0;

  useEffect(() => {
    if (!canInitialize || !gameUIManager) {
      return;
    }
    // if (!fCanvas && canvasRef.current) {
    //   // setFCanvas(new fabric.Canvas(canvasRef.current));
    // }

    const uiEmitter: UIEmitter = UIEmitter.getInstance();

    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const { deltaY } = e;
      uiEmitter.emit(UIEmitterEvent.CanvasScroll, deltaY);
    };

    // const canvas = fCanvas?.getSelectionElement();
    const canvas = evtRef.current;
    if (!canvas || !canvasRef.current || !glRef.current || !bufferRef.current) {
      return;
    }

    // This zooms your home world in really close to show the awesome details
    // TODO: Store this as it changes and re-initialize to that if stored
    const defaultWorldUnits = 4;
    Viewport.initialize(gameUIManager, defaultWorldUnits, canvas);
    Renderer.initialize(
      canvasRef.current,
      glRef.current,
      bufferRef.current,
      Viewport.getInstance(),
      gameUIManager as unknown as RendererGameContext,
      {
        spaceColors: {
          innerNebulaColor: gameUIManager.getStringSetting(
            Setting.RendererColorInnerNebula,
          ),
          nebulaColor: gameUIManager.getStringSetting(
            Setting.RendererColorNebula,
          ),
          spaceColor: gameUIManager.getStringSetting(
            Setting.RendererColorSpace,
          ),
          deepSpaceColor: gameUIManager.getStringSetting(
            Setting.RendererColorDeepSpace,
          ),
          deadSpaceColor: gameUIManager.getStringSetting(
            Setting.RendererColorDeadSpace,
          ),
        },
      },
    );
    initializedRef.current = true;
    const unbindPointerEvents = bindCanvasPointerEvents(canvas);

    // We can't attach the wheel event onto the canvas due to:
    // https://www.chromestatus.com/features/6662647093133312
    canvas.addEventListener("wheel", onWheel);
    // fCanvas.on("mouse:wheel", onWheel);
    window.addEventListener("resize", doResize);

    uiEmitter.on(UIEmitterEvent.UIChange, doResize);

    const initialResizeFrameId = window.requestAnimationFrame(() => {
      uiEmitter.emit(UIEmitterEvent.WindowResize);
      setInputReady(true);
      onInputReadyChange?.(true);
    });

    return () => {
      initializedRef.current = false;
      window.cancelAnimationFrame(initialResizeFrameId);
      setInputReady(false);
      onInputReadyChange?.(false);
      unbindPointerEvents();
      Viewport.destroyInstance();
      Renderer.destroy();
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", doResize);
      uiEmitter.removeListener(UIEmitterEvent.UIChange, doResize);
    };
  }, [
    canInitialize,
    gameUIManager,
    doResize,
    onInputReadyChange,
    canvasRef,
    glRef,
    bufferRef,
    evtRef,
  ]);

  // Keyboard movement handlers with continuous movement supportAdd commentMore actions
  const isUpPressed = useIsDown(MOVE_UP);
  const isDownPressed = useIsDown(MOVE_DOWN);
  const isLeftPressed = useIsDown(MOVE_LEFT);
  const isRightPressed = useIsDown(MOVE_RIGHT);

  // Continuous movement using animation frame
  useEffect(() => {
    if (sharingMap) return;
    let animationId: number;

    const moveCamera = () => {
      const uiEmitter = UIEmitter.getInstance();

      if (isUpPressed) {
        uiEmitter.emit(UIEmitterEvent.MoveUp);
      }
      if (isDownPressed) {
        uiEmitter.emit(UIEmitterEvent.MoveDown);
      }
      if (isLeftPressed) {
        uiEmitter.emit(UIEmitterEvent.MoveLeft);
      }
      if (isRightPressed) {
        uiEmitter.emit(UIEmitterEvent.MoveRight);
      }

      // Continue the animation loop if any key is pressed
      if (isUpPressed || isDownPressed || isLeftPressed || isRightPressed) {
        animationId = requestAnimationFrame(moveCamera);
      }
    };

    // Start movement if any key is pressed
    if (isUpPressed || isDownPressed || isLeftPressed || isRightPressed) {
      animationId = requestAnimationFrame(moveCamera);
    }

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [isUpPressed, isDownPressed, isLeftPressed, isRightPressed, sharingMap]);

  return (
    <CanvasWrapper
      ref={wrapperRef}
      style={{ cursor: targeting ? "crosshair" : undefined }}
    >
      <canvas ref={glRef} width={width} height={height} />
      <canvas data-guide-map ref={canvasRef} width={width} height={height} />
      <canvas ref={bufferRef} id="buffer" />
      <MapShareTools
        game={{
          chainId: network.publicClient.chain.id,
          world: gameUIManager.getContractAddress(),
        }}
        manager={gameUIManager.getGameManager()}
        mapReady={inputReady}
        onReturnHome={onReturnHome}
        onSelectionChange={setSharingMap}
      >
        {children}
      </MapShareTools>
    </CanvasWrapper>
  );
}
