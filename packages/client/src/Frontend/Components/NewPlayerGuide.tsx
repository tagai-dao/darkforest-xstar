import { isLocatable } from "@df/gamelogic";
import { engineConsts } from "@df/renderer/EngineConsts";
import type { LocatablePlanet } from "@df/types";
import { PlanetType } from "@df/types";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import styled, { keyframes } from "styled-components";

import type { GameUIManager } from "../../Backend/GameLogic/GameUIManager";
import UIEmitter, { UIEmitterEvent } from "../Utils/UIEmitter";

const STORAGE_PREFIX = "df.newPlayerGuide.seen.";
const seenWallets = new Set<string>();
const { barbsA, pendingJunkA, whiteA } = engineConsts.colors;

export function useNewPlayerGuide(walletAddress?: string) {
  const wallet = walletAddress?.toLowerCase();
  const [guideOpen, setGuideOpen] = useState(false);
  const openGuide = useCallback(() => setGuideOpen(true), []);
  const closeGuide = useCallback(() => setGuideOpen(false), []);

  useEffect(() => {
    if (!wallet || seenWallets.has(wallet)) return;
    try {
      if (window.localStorage.getItem(STORAGE_PREFIX + wallet)) return;
    } catch {
      // 当前页面仍可用内存记录展示状态。
    }
    openGuide();
  }, [wallet, openGuide]);

  return { guideOpen, openGuide, closeGuide };
}

const steps = [
  {
    id: "select",
    title: "选择己方星球",
    text: "点击箭头指向的己方星球，右侧会打开星球详情。",
  },
  {
    id: "register",
    title: "登记星球",
    text: "点击「复制 addJunk」，把命令粘贴给 agent。登记成功后数字会变白，星球按类型恢复能量或生产资源。",
    control: '[data-guide-target="add-junk"]',
    findPlanet: "选择一颗能量数字呈琥珀色的己方星球。",
    unavailable: "需要一颗己方已占领、尚未登记的星球。",
  },
  {
    id: "energy",
    title: "调整出发能量",
    text: "拖动「出发能量」滑条，或点击加减按钮，设置本次派出的能量。",
    control: '[data-guide-target="departure-energy"] input',
    findPlanet: "先选一颗有能量的己方星球作出发星。",
    unavailable: "当前没有可用于出发的己方星球。",
  },
  {
    id: "move",
    title: "拖动出兵",
    text: "从箭头指向的出发星按住鼠标，拖到另一颗星球上松开。拖到己方是支援，拖到无主或敌方星球可尝试占领。出兵单复制后，粘贴给 agent。",
    findPlanet: "找到一颗有能量的己方星球，按住它拖到目标星球。",
    unavailable: "当前没有可用于出发的己方星球。",
  },
  {
    id: "silver",
    title: "购买银",
    text: "点击一档银量，把购银单粘贴给 agent。按钮下方显示 AIPRO 价格。",
    control: '[data-guide-target="buy-silver"] button:not(:disabled)',
    findPlanet: "选择一颗有空余银容量、已登记的己方 1 级或以上星球。",
    unavailable:
      "当前未找到可购买银的档位。购银要求星球已登记、符合等级要求且银容量足够。",
  },
  {
    id: "quota",
    title: "扩充垃圾额度",
    text: "查看各档的 BNB 价格，选一档复制购买命令，再粘贴给 agent。",
    control: '[data-guide-target="buy-junk-tier"]:not(:disabled)',
    unavailable: "没有可选的额度档位，或当前额度还在同步。",
  },
  {
    id: "upgrade",
    title: "用银升级行星",
    text: "选择范围、速度或防御分支，点击「复制升级」，再把命令粘贴给 agent。",
    control: '[data-guide-target="upgrade"] button:not(:disabled)',
    findPlanet: "选择一颗已登记、有银可用的己方 1 级或以上普通行星。",
    unavailable:
      "当前未找到可用的升级按钮。升级要求己方普通行星已登记、等级至少为 1 且有足够的银。",
  },
] satisfies {
  id: string;
  title: string;
  text: string;
  control?: string;
  findPlanet?: string;
  unavailable?: string;
}[];

type Step = (typeof steps)[number];
type Bounds = { left: number; top: number; width: number; height: number };
type Anchor = { bounds: Bounds; hint?: string; arrow: boolean };

function boundsOf(element: Element) {
  const rect = element.getBoundingClientRect();
  const pane = element.closest("aside, [data-guide-panel]");
  const clip = pane?.getBoundingClientRect();
  const left = Math.max(0, rect.left, clip?.left ?? 0);
  const top = Math.max(0, rect.top, clip?.top ?? 0);
  const right = Math.min(
    window.innerWidth,
    rect.right,
    clip?.right ?? Infinity,
  );
  const bottom = Math.min(
    window.innerHeight,
    rect.bottom,
    clip?.bottom ?? Infinity,
  );
  if (right > left && bottom > top) {
    return { left, top, width: right - left, height: bottom - top };
  }
}

function mapBounds(uiManager: GameUIManager, candidates: LocatablePlanet[]) {
  const canvas = document.querySelector("[data-guide-map]");
  if (!canvas || !candidates.length) return;

  const map = canvas.getBoundingClientRect();
  let viewport: ReturnType<GameUIManager["getViewport"]>;
  try {
    viewport = uiManager.getViewport();
  } catch {
    // 画布还没初始化。
    return;
  }

  for (const planet of candidates) {
    const point = viewport.worldToCanvasCoords(planet.location.coords);
    const x = Math.round(map.left + point.x);
    const y = Math.round(map.top + point.y);
    if (document.elementFromPoint(x, y) !== canvas) continue;
    const clickCoords = viewport.canvasToWorldCoords({
      x: x - map.left,
      y: y - map.top,
    });
    if (
      uiManager.isOverOwnPlanet(clickCoords)?.locationId !== planet.locationId
    )
      continue;
    const size = Math.max(
      32,
      Math.min(
        60,
        Math.round(
          viewport.worldToCanvasDist(
            uiManager.getRadiusOfPlanetLevel(planet.planetLevel),
          ) * 2,
        ),
      ),
    );
    return { left: x - size / 2, top: y - size / 2, width: size, height: size };
  }
}

function isRegistered(planet: LocatablePlanet) {
  return planet.addJunkTick > 0 && planet.junkOwner === planet.owner;
}

function suitablePlanet(step: Step["id"], planet: LocatablePlanet) {
  switch (step) {
    case "register":
      return !isRegistered(planet);
    case "energy":
    case "move":
      return planet.energy >= 2;
    case "silver":
      return (
        isRegistered(planet) &&
        planet.planetType !== PlanetType.TRADING_POST &&
        planet.planetLevel >= 1 &&
        planet.silver < planet.silverCap
      );
    case "upgrade":
      return (
        isRegistered(planet) &&
        planet.planetType === PlanetType.PLANET &&
        planet.planetLevel >= 1 &&
        planet.silver > 0
      );
    default:
      return true;
  }
}

function findAnchor(
  step: Step,
  uiManager: GameUIManager,
  owned: LocatablePlanet[],
  reveal: (element: Element) => void,
): Anchor | undefined {
  const control = (
    selector: string,
    hint?: string,
    scope: ParentNode = document,
  ): Anchor | undefined => {
    const element = scope.querySelector(selector);
    if (!element) return;
    if (element.closest("aside, [data-guide-panel]")) reveal(element);
    const bounds = boundsOf(element);
    if (bounds) return { bounds, hint, arrow: true };
  };

  const selected = uiManager.getSelectedPlanet();
  if (
    step.control &&
    (step.id !== "energy" || (selected && suitablePlanet(step.id, selected)))
  ) {
    const action = control(step.control);
    if (action) return action;
  }

  const expand = '[data-guide-target="expand-status"]';
  const status = "[data-public-status]";
  if (step.id === "quota") {
    const panel = document.querySelector('[data-guide-panel="buy-junk"]');
    if (!panel) {
      const open =
        control(
          '[data-guide-target="buy-junk"]:not(:disabled)',
          "点击「垃圾额度」旁的「购买」，打开额度档位。",
        ) ?? control(expand, "先展开「相关信息」，找到垃圾额度。");
      if (open) return open;
    }
    const reference = panel ?? document.querySelector(status);
    const bounds = reference && boundsOf(reference);
    return bounds
      ? { bounds, hint: step.unavailable, arrow: false }
      : undefined;
  }

  const selecting = step.id === "select";
  const moving = step.id === "move";
  const candidates = owned.filter(
    (planet) =>
      suitablePlanet(step.id, planet) &&
      (selecting || moving || planet.locationId !== selected?.locationId),
  );
  const mapCandidates = selecting
    ? [
        ...candidates.filter((planet) => !isRegistered(planet)),
        ...candidates.filter(isRegistered),
      ]
    : candidates;
  const origin =
    moving &&
    selected &&
    suitablePlanet(step.id, selected) &&
    uiManager.canLaunchFrom(selected)
      ? selected
      : undefined;
  const bounds = mapBounds(
    uiManager,
    origin ? [origin, ...mapCandidates] : mapCandidates,
  );
  if (bounds) {
    return {
      bounds,
      arrow: true,
      hint: moving || selecting ? undefined : step.findPlanet,
    };
  }

  const ownedPanel = document.querySelector(
    '[data-guide-panel="owned-planets"]',
  );
  if (ownedPanel) {
    if (origin) {
      const close = control(
        '[data-guide-target="close-owned-planets"]',
        "关闭星球列表，回到地图后从出发星拖动。",
        ownedPanel,
      );
      if (close) return close;
    }
    for (const planet of mapCandidates) {
      const link = control(
        `[data-guide-planet="${planet.locationId}"]`,
        selecting ? "点击星球名称，定位并打开右侧星球详情。" : step.findPlanet,
        ownedPanel,
      );
      if (link) return link;
    }
  }

  if (mapCandidates.length && !ownedPanel) {
    const list =
      control(
        '[data-guide-target="owned-planets"]',
        "点击「占领星球」，在列表里选择要操作的星球。",
      ) ?? control(expand, "先展开「相关信息」，找到「占领星球」。");
    if (list) return list;
  }

  const panel = ownedPanel ?? document.querySelector(status);
  const fallback = panel && boundsOf(panel);
  return fallback
    ? {
        bounds: fallback,
        hint: step.unavailable ?? step.findPlanet,
        arrow: false,
      }
    : undefined;
}

function sameAnchor(left?: Anchor, right?: Anchor) {
  if (!left || !right) return left === right;
  return (
    left.arrow === right.arrow &&
    left.hint === right.hint &&
    left.bounds.left === right.bounds.left &&
    left.bounds.top === right.bounds.top &&
    left.bounds.width === right.bounds.width &&
    left.bounds.height === right.bounds.height
  );
}

function placeCard(
  bounds: Bounds,
  width: number,
  height: number,
  arrow: boolean,
) {
  const margin = 12;
  const gap = arrow ? 42 : 12;
  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;
  const right = bounds.left + bounds.width;
  const bottom = bounds.top + bounds.height;
  const sides = [
    {
      space: bounds.left - width,
      left: bounds.left - width - gap,
      top: centerY - height / 2,
      x: bounds.left - 18,
      y: centerY,
      rotation: 0,
    },
    {
      space: window.innerWidth - right - width,
      left: right + gap,
      top: centerY - height / 2,
      x: right + 18,
      y: centerY,
      rotation: 180,
    },
  ];
  const vertical = [
    {
      space: window.innerHeight - bottom - height,
      left: centerX - width / 2,
      top: bottom + gap,
      x: centerX,
      y: bottom + 18,
      rotation: -90,
    },
    {
      space: bounds.top - height,
      left: centerX - width / 2,
      top: bounds.top - height - gap,
      x: centerX,
      y: bounds.top - 18,
      rotation: 90,
    },
  ];
  const position =
    sides.find(({ space }) => space >= margin + gap) ??
    vertical.reduce((best, option) =>
      option.space > best.space ? option : best,
    );
  return {
    left: Math.max(
      margin,
      Math.min(position.left, window.innerWidth - width - margin),
    ),
    top: Math.max(
      margin,
      Math.min(position.top, window.innerHeight - height - margin),
    ),
    x: position.x,
    y: position.y,
    rotation: position.rotation,
  };
}

export function NewPlayerGuide({
  uiManager,
  walletAddress,
  homeReady,
  onClose,
}: {
  uiManager: GameUIManager;
  walletAddress?: string;
  homeReady: boolean;
  onClose: () => void;
}) {
  const card = useRef<HTMLElement>(null);
  const headingId = useId();
  const [index, setIndex] = useState(0);
  const [anchor, setAnchor] = useState<Anchor>();
  const [position, setPosition] = useState<ReturnType<typeof placeCard>>();
  const [mapPressed, setMapPressed] = useState(false);
  const step = steps[index];

  useEffect(() => {
    if (!walletAddress) return;
    const wallet = walletAddress.toLowerCase();
    seenWallets.add(wallet);
    try {
      window.localStorage.setItem(STORAGE_PREFIX + wallet, "1");
    } catch {
      // 当前页面仍可用内存记录展示状态。
    }
  }, [walletAddress]);

  useLayoutEffect(() => {
    let revealed: Element | undefined;
    let lastRead = -Infinity;
    let owned: LocatablePlanet[] = [];
    const measure = () => {
      const now = performance.now();
      if (now - lastRead >= 500) {
        lastRead = now;
        owned =
          step.id === "quota"
            ? []
            : uiManager
                .getAllOwnedPlanets()
                .filter(
                  (planet): planet is LocatablePlanet =>
                    isLocatable(planet) &&
                    !planet.destroyed &&
                    !planet.frozen &&
                    uiManager.isOwnedByMe(planet),
                );
      }

      const next = findAnchor(step, uiManager, owned, (element) => {
        if (revealed === element) return;
        revealed = element;
        element.scrollIntoView({ block: "nearest", inline: "nearest" });
      });
      setAnchor((current) => (sameAnchor(current, next) ? current : next));
    };
    measure();
    const timer = window.setInterval(measure, 80);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step, uiManager]);

  useLayoutEffect(() => {
    const element = card.current;
    if (!element) return;
    const update = () => {
      const reference = anchor?.bounds ?? {
        left: window.innerWidth / 2,
        top: 0,
        width: 0,
        height: 0,
      };
      setPosition(
        placeCard(
          reference,
          element.offsetWidth,
          element.offsetHeight,
          !!anchor?.arrow,
        ),
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [anchor]);

  const advance = useCallback(() => {
    if (index === steps.length - 1) onClose();
    else setIndex(index + 1);
  }, [index, onClose]);

  useEffect(() => {
    const emitter = UIEmitter.getInstance();
    const pressMap = () => setMapPressed(true);
    const releaseMap = () => setMapPressed(false);
    emitter.on(UIEmitterEvent.CanvasMouseDown, pressMap);
    emitter.on(UIEmitterEvent.CanvasMouseUp, releaseMap);
    emitter.on(UIEmitterEvent.CanvasMouseOut, releaseMap);
    return () => {
      emitter.off(UIEmitterEvent.CanvasMouseDown, pressMap);
      emitter.off(UIEmitterEvent.CanvasMouseUp, releaseMap);
      emitter.off(UIEmitterEvent.CanvasMouseOut, releaseMap);
    };
  }, []);

  useEffect(() => {
    const emitter = UIEmitter.getInstance();
    const select = () => {
      const planet = uiManager.getSelectedPlanet();
      if (step.id === "select" && planet && uiManager.isOwnedByMe(planet))
        advance();
    };
    const move = () => {
      if (step.id === "move") advance();
    };
    const adjustEnergy = (event: Event) => {
      if (step.id !== "energy" || !(event.target instanceof Element)) return;
      const selector = event.type === "input" ? "input" : "button";
      if (
        !event.target.closest(
          `[data-guide-target="departure-energy"] ${selector}`,
        )
      )
        return;
      const selected = uiManager.getSelectedPlanet();
      if (
        selected &&
        suitablePlanet(step.id, selected) &&
        uiManager.getForcesSending(selected.locationId) > 0
      )
        advance();
    };
    const click = (event: MouseEvent) => {
      if (step.id === "energy") {
        adjustEnergy(event);
      } else if (
        step.control &&
        event.target instanceof Element &&
        event.target.closest(step.control)
      ) {
        advance();
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      onClose();
    };

    emitter.on(UIEmitterEvent.GamePlanetSelected, select);
    emitter.on(UIEmitterEvent.MoveOrderCreated, move);
    document.addEventListener("click", click);
    document.addEventListener("input", adjustEnergy);
    window.addEventListener("keyup", closeOnEscape, true);
    return () => {
      emitter.off(UIEmitterEvent.GamePlanetSelected, select);
      emitter.off(UIEmitterEvent.MoveOrderCreated, move);
      document.removeEventListener("click", click);
      document.removeEventListener("input", adjustEnergy);
      window.removeEventListener("keyup", closeOnEscape, true);
    };
  }, [step, uiManager, advance, onClose]);

  const choosePlanet = step.id === "select";
  const selectHint = homeReady
    ? "地图同步后，点击己方星球打开详情。也可以从「相关信息」里的「占领星球」定位。"
    : "先让 agent 注册并出生。地图同步后，就能点击己方星球打开详情。";
  const text =
    choosePlanet && !anchor?.arrow ? selectHint : (anchor?.hint ?? step.text);

  return createPortal(
    <Overlay data-game-guide data-map-pressed={mapPressed || undefined}>
      {anchor?.arrow && <Spotlight aria-hidden="true" style={anchor.bounds} />}
      {anchor?.arrow && position && (
        <Arrow
          aria-hidden="true"
          style={{
            left: position.x,
            top: position.y,
            transform: `translate(-50%, -50%) rotate(${position.rotation}deg)`,
          }}
        >
          <ArrowShape />
        </Arrow>
      )}
      <Card
        ref={card}
        aria-labelledby={headingId}
        style={
          position
            ? { left: position.left, top: position.top }
            : { visibility: "hidden" }
        }
      >
        <Header>
          <span>
            新手指引 · {index + 1} / {steps.length}
          </span>
          <Action type="button" onClick={onClose}>
            关闭
          </Action>
        </Header>
        <Body aria-live="polite">
          <Title id={headingId}>{step.title}</Title>
          <p>{text}</p>
          {choosePlanet && (
            <Legend aria-label="星球能量数字颜色">
              <span style={{ color: `rgb(${barbsA.slice(0, 3).join(",")})` }}>
                ● 无主
              </span>
              <span
                style={{ color: `rgb(${pendingJunkA.slice(0, 3).join(",")})` }}
              >
                ● 己方待登记
              </span>
              <span style={{ color: `rgb(${whiteA.slice(0, 3).join(",")})` }}>
                ● 己方已登记
              </span>
            </Legend>
          )}
          {step.id === "move" && anchor?.arrow && !anchor.hint && (
            <p>没有生成出兵单时，试试更近的目标，或加大出发能量。</p>
          )}
        </Body>
        <Footer>
          <Action
            type="button"
            disabled={index === 0}
            onClick={() => setIndex(index - 1)}
          >
            上一步
          </Action>
          <NextAction type="button" onClick={advance}>
            {index === steps.length - 1 ? "完成" : "下一步"}
          </NextAction>
        </Footer>
      </Card>
    </Overlay>,
    document.body,
  );
}

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 16000200;
  overflow: hidden;
  pointer-events: none;

  &[data-map-pressed] {
    visibility: hidden;
  }
`;

const Spotlight = styled.div`
  position: absolute;
  pointer-events: none;
  outline: 2px solid #73edba;
  outline-offset: 3px;
  border-radius: 4px;
  box-shadow: 0 0 0 200vmax rgb(2 6 12 / 42%);
`;

const Arrow = styled.div`
  position: absolute;
  pointer-events: none;
  width: 27px;
  height: 23px;
  filter: drop-shadow(0 0 4px #0c141e);
`;

const point = keyframes`
  from { transform: translateX(-7px); }
  to { transform: translateX(1px); }
`;

const ArrowShape = styled.div`
  width: 100%;
  height: 100%;
  background: #73edba;
  clip-path: polygon(0 35%, 47% 35%, 47% 0, 100% 50%, 47% 100%, 47% 65%, 0 65%);
  animation: ${point} 650ms ease-in-out infinite alternate;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const Card = styled.section`
  position: absolute;
  pointer-events: none;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: min(320px, calc(100vw - 24px));
  max-height: min(46vh, 270px);
  padding: 11px 13px;
  border: 1px solid #3d4d63;
  border-top-color: #73edba;
  background: #0c141e;
  color: #e8eef7;
  box-shadow: 0 8px 24px rgb(0 0 0 / 45%);
  font:
    14px/1.55 system-ui,
    sans-serif;
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: #73edba;
  font-size: 12px;
  font-weight: 600;
`;

const Title = styled.h2`
  margin: 4px 0;
  font-size: 17px;
  font-weight: 700;
`;

const Body = styled.div`
  min-height: 0;
  overflow-y: auto;

  p {
    margin: 0;
  }

  p + p {
    margin-top: 4px;
    color: #a8bbcb;
  }
`;

const Legend = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 3px 10px;
  margin-top: 5px;
  font-size: 12px;
`;

const Action = styled.button`
  pointer-events: auto;
  min-height: 30px;
  padding: 1px 8px;
  border: 1px solid #43566a;
  background: #152130;
  color: #e8eef7;
  font: inherit;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    border-color: #73edba;
  }

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
`;

const Footer = styled.footer`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
  font-size: 12px;
`;

const NextAction = styled(Action)`
  border-color: #73edba;
  background: #73edba;
  color: #081911;

  &:hover,
  &:focus-visible {
    background: #a1f4cf;
  }
`;
