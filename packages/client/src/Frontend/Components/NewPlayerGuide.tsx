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
import UIEmitter, {
  type GuidedOrderKind,
  type OrderCopyResult,
  UIEmitterEvent,
} from "../Utils/UIEmitter";

const STORAGE_PREFIX = "df.newPlayerGuide.seen.";
const seenGuides = new Set<string>();
const { barbsA, pendingJunkA, whiteA } = engineConsts.colors;

function hasSeenGuide(key: string) {
  if (seenGuides.has(key)) return true;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function recordGuideSeen(key: string) {
  seenGuides.add(key);
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // 当前页面仍可用内存记录展示状态。
  }
}

function resourceGuideKey(uiManager: GameUIManager, wallet: string) {
  return `${STORAGE_PREFIX}resources.${uiManager.getContractAddress().toLowerCase()}.${wallet}`;
}

function findResourcePlanet(uiManager: GameUIManager, type: PlanetType) {
  let discovered: LocatablePlanet | undefined;
  for (const planet of uiManager.getPlanetMap().values()) {
    if (planet.planetType !== type || planet.destroyed || !isLocatable(planet))
      continue;
    if (uiManager.isOwnedByMe(planet)) return planet;
    discovered ??= planet;
  }
  return discovered;
}

function hasDiscoveredResourcePlanets(uiManager: GameUIManager) {
  let foundAsteroid = false;
  let foundRift = false;
  for (const planet of uiManager.getPlanetMap().values()) {
    if (planet.destroyed || !isLocatable(planet)) continue;
    if (planet.planetType === PlanetType.SILVER_MINE) foundAsteroid = true;
    if (planet.planetType === PlanetType.TRADING_POST) foundRift = true;
    if (foundAsteroid && foundRift) return true;
  }
  return false;
}

export function useNewPlayerGuide(
  uiManager: GameUIManager,
  walletAddress?: string,
) {
  const wallet = walletAddress?.toLowerCase();
  const [guideStart, setGuideStart] = useState<number>();
  const [deferResources, setDeferResources] = useState(false);
  const openGuide = useCallback(() => setGuideStart(0), []);
  const closeGuide = useCallback(() => {
    if (
      guideStart === 0 &&
      wallet &&
      !hasSeenGuide(resourceGuideKey(uiManager, wallet)) &&
      hasDiscoveredResourcePlanets(uiManager)
    ) {
      setDeferResources(true);
    }
    setGuideStart(undefined);
  }, [guideStart, uiManager, wallet]);

  useEffect(() => {
    if (wallet && !hasSeenGuide(STORAGE_PREFIX + wallet)) openGuide();
  }, [wallet, openGuide]);

  useEffect(() => {
    if (
      !wallet ||
      guideStart !== undefined ||
      deferResources ||
      !hasSeenGuide(STORAGE_PREFIX + wallet) ||
      hasSeenGuide(resourceGuideKey(uiManager, wallet))
    )
      return;
    const checkMap = () => {
      if (!hasDiscoveredResourcePlanets(uiManager)) return;
      window.clearInterval(timer);
      setGuideStart(RESOURCE_GUIDE_START);
    };
    const timer = window.setInterval(checkMap, 1500);
    checkMap();
    return () => window.clearInterval(timer);
  }, [deferResources, guideStart, uiManager, wallet]);

  return { guideStart, openGuide, closeGuide };
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
    text: "点击「登记」生成登记单。登记成功后数字会变白，星球按类型恢复能量或生产资源。",
    order: "add-junk",
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
    text: "按住出发星，拖到另一颗星球上松开，页面会复制出兵单。拖到己方是支援，拖到无主或敌方星球可尝试占领。",
    order: "move",
    findPlanet: "找到一颗有能量的己方星球，按住它拖到目标星球。",
    unavailable: "当前没有可用于出发的己方星球。",
  },
  {
    id: "silver",
    title: "购买银",
    purpose:
      "银可用于升级行星的范围、速度或防御，也可以运到自己的时空裂隙换分。",
    text: "点击一档银量，复制购银单。按钮下方显示 AIPRO 价格。",
    order: "buy-silver",
    control: '[data-guide-target="buy-silver"] button:not(:disabled)',
    findPlanet: "选择一颗有空余银容量、已登记的己方 1 级或以上星球。",
    unavailable:
      "当前未找到可购买银的档位。购银要求星球已登记、符合等级要求且银容量足够。",
  },
  {
    id: "quota",
    title: "扩充垃圾额度",
    purpose:
      "提高额度上限后，可以登记更多已占领的星球，让它们恢复能量或生产资源。",
    text: "查看各档的 BNB 价格，选一档复制购买命令。",
    order: "buy-junk",
    control: '[data-guide-target="buy-junk-tier"]:not(:disabled)',
    unavailable: "没有可选的额度档位，或当前额度还在同步。",
  },
  {
    id: "upgrade",
    title: "用银升级行星",
    text: "选择范围、速度或防御分支，点击「升级」。",
    order: "upgrade",
    control: '[data-guide-target="upgrade"] button:not(:disabled)',
    findPlanet: "选择一颗已登记、有银可用的己方 1 级或以上普通行星。",
    unavailable:
      "当前未找到可用的升级按钮。升级要求己方普通行星已登记、等级至少为 1 且有足够的银。",
  },
  {
    id: "asteroid",
    title: "小行星带与材料",
    planetType: PlanetType.SILVER_MINE,
    purpose:
      "占领并登记小行星带后，它会生产银和材料。不同生物群系产出的材料不同。",
    text: "在右侧查看银和材料。出发时，用「出发银」和「带走材料」设置要运走的数量。",
    findPlanet: "点击箭头指向的小行星带，打开右侧详情。",
    unavailable:
      "地图上还没找到可定位的小行星带。让 agent 继续探索，发现后就能在地图上查看。",
  },
  {
    id: "rift",
    title: "时空裂隙与换分",
    planetType: PlanetType.TRADING_POST,
    purpose:
      "在自己的时空裂隙提取银或材料，会增加游戏分数，也会增加你在奖池里的质押。",
    text: "把银或材料运到自己已登记的裂隙。舰队到达后，在右侧选择提取量，再点「复制换分」。不同材料的换分倍率不同。",
    findPlanet: "点击箭头指向的时空裂隙，查看右侧详情。",
    unavailable:
      "地图上还没找到可定位的时空裂隙。让 agent 继续探索，发现后就能在地图上查看。",
    control: '[data-guide-target="convert-score"]:not(:disabled)',
    order: "convert-score",
  },
  {
    id: "rewards",
    title: "领取 AIPRO 游戏奖励",
    purpose:
      "奖池里的 AIPRO 按质押份额分配。提取银或材料增加的质押，可以用来获得这份游戏奖励。",
    text: "有待领取的奖励时，点「相关信息」中「游戏奖励」旁的「领取」，把命令粘贴给 agent。",
    control: '[data-guide-target="claim-game-rewards"]:not(:disabled)',
    order: "claim-rewards",
  },
] satisfies {
  id: string;
  title: string;
  text: string;
  purpose?: string;
  order?: GuidedOrderKind;
  control?: string;
  findPlanet?: string;
  unavailable?: string;
  planetType?: PlanetType;
}[];

const RESOURCE_GUIDE_START = steps.findIndex((step) => step.id === "asteroid");
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
      uiManager.getVisiblePlanetAtCoords(clickCoords)?.locationId !==
      planet.locationId
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
  resource: LocatablePlanet | undefined,
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
  const nearby = (selector: string, hint?: string): Anchor | undefined => {
    const element = document.querySelector(selector);
    const bounds = element && boundsOf(element);
    if (bounds) return { bounds, hint, arrow: false };
  };

  const selected = uiManager.getSelectedPlanet();
  const expand = '[data-guide-target="expand-status"]';
  const status = "[data-public-status]";
  if (step.planetType !== undefined) {
    if (selected?.planetType === step.planetType) {
      const action = step.control && control(step.control);
      return (
        action ||
        nearby('[data-guide-panel="planet-details"]') ||
        nearby(status)
      );
    }
    const bounds = resource && mapBounds(uiManager, [resource]);
    if (bounds) return { bounds, hint: step.findPlanet, arrow: true };
    if (resource) {
      return (
        control(
          '[data-guide-target="close-owned-planets"]',
          "先关闭星球列表，再点击地图上的目标星球。",
        ) ?? nearby(status, "点击地图上的目标星球，查看右侧详情。")
      );
    }
    return nearby(status, step.unavailable);
  }
  if (
    step.control &&
    (step.id !== "energy" || (selected && suitablePlanet(step.id, selected)))
  ) {
    const action = control(step.control);
    if (action) return action;
  }

  if (step.id === "rewards") {
    return (
      control(expand, "展开「相关信息」，查看游戏奖励。") ??
      nearby('[data-guide-target="game-rewards"]') ??
      nearby(status)
    );
  }
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
  startAt,
  onClose,
}: {
  uiManager: GameUIManager;
  walletAddress?: string;
  homeReady: boolean;
  startAt: number;
  onClose: () => void;
}) {
  const card = useRef<HTMLElement>(null);
  const headingId = useId();
  const [index, setIndex] = useState(startAt);
  const [anchor, setAnchor] = useState<Anchor>();
  const [position, setPosition] = useState<ReturnType<typeof placeCard>>();
  const [mapPressed, setMapPressed] = useState(false);
  const [copyResult, setCopyResult] = useState<OrderCopyResult>();
  const step = steps[index];
  const handoff = copyResult?.kind === step.order ? copyResult : undefined;
  const awaitingAgent = handoff !== undefined;

  useEffect(() => {
    if (!walletAddress) return;
    const wallet = walletAddress.toLowerCase();
    if (index >= RESOURCE_GUIDE_START) {
      const key = resourceGuideKey(uiManager, wallet);
      if (
        !hasSeenGuide(key) &&
        (startAt === RESOURCE_GUIDE_START ||
          hasDiscoveredResourcePlanets(uiManager))
      ) {
        recordGuideSeen(key);
      }
    } else if (!hasSeenGuide(STORAGE_PREFIX + wallet)) {
      recordGuideSeen(STORAGE_PREFIX + wallet);
    }
  }, [index, startAt, uiManager, walletAddress]);

  useLayoutEffect(() => {
    if (awaitingAgent) return;
    let revealed: Element | undefined;
    let lastRead = -Infinity;
    let owned: LocatablePlanet[] = [];
    let resource: LocatablePlanet | undefined;
    let focused: string | undefined;
    const measure = () => {
      const now = performance.now();
      if (now - lastRead >= 500) {
        lastRead = now;
        if (step.planetType !== undefined) {
          const current =
            resource && uiManager.getPlanetMap().get(resource.locationId);
          resource =
            current &&
            isLocatable(current) &&
            !current.destroyed &&
            current.planetType === step.planetType
              ? current
              : findResourcePlanet(uiManager, step.planetType);
        } else if (step.id !== "quota" && step.id !== "rewards") {
          owned = uiManager
            .getAllOwnedPlanets()
            .filter(
              (planet): planet is LocatablePlanet =>
                isLocatable(planet) &&
                !planet.destroyed &&
                !planet.frozen &&
                uiManager.isOwnedByMe(planet),
            );
        }
      }

      if (resource && resource.locationId !== focused) {
        try {
          const viewport = uiManager.getViewport();
          if (!viewport.mousedownCoords) {
            viewport.focus(
              resource.location.coords,
              Math.max(
                96,
                uiManager.getRadiusOfPlanetLevel(resource.planetLevel) * 36,
              ),
            );
            focused = resource.locationId;
          }
        } catch {
          // 等画布初始化后再定位。
        }
      }

      const next = findAnchor(step, uiManager, owned, resource, (element) => {
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
  }, [awaitingAgent, step, uiManager]);

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
    setCopyResult(undefined);
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
    const orderCopied = (result: OrderCopyResult) => {
      if (result.kind && result.kind === step.order) setCopyResult(result);
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
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      onClose();
    };

    emitter.on(UIEmitterEvent.GamePlanetSelected, select);
    emitter.on(UIEmitterEvent.MoveOrderCopied, orderCopied);
    document.addEventListener("click", adjustEnergy);
    document.addEventListener("input", adjustEnergy);
    window.addEventListener("keyup", closeOnEscape, true);
    return () => {
      emitter.off(UIEmitterEvent.GamePlanetSelected, select);
      emitter.off(UIEmitterEvent.MoveOrderCopied, orderCopied);
      document.removeEventListener("click", adjustEnergy);
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
  const showArrow = anchor?.arrow && !awaitingAgent;
  const nextLabel = index === steps.length - 1 ? "完成" : "下一步";

  return createPortal(
    <Overlay data-game-guide data-map-pressed={mapPressed || undefined}>
      {showArrow && <Spotlight aria-hidden="true" style={anchor.bounds} />}
      {showArrow && position && (
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
            新手指引 · {index - startAt + 1} / {steps.length - startAt}
          </span>
          <Action type="button" onClick={onClose}>
            关闭
          </Action>
        </Header>
        <Body aria-live="polite">
          <Title id={headingId}>
            {handoff ? "粘贴命令给 agent" : step.title}
          </Title>
          {handoff ? (
            <>
              <p>
                {handoff.copied
                  ? "命令已复制。请切换到 agent，把命令粘贴并发送。"
                  : "请手动复制下面的命令，粘贴给 agent 并发送。"}
              </p>
              {!handoff.copied && (
                <CommandText
                  aria-label="待复制的命令"
                  value={handoff.text}
                  readOnly
                  onFocus={(event) => event.currentTarget.select()}
                />
              )}
              <p>等 agent 确认执行成功后，再点「{nextLabel}」。</p>
            </>
          ) : (
            <>
              {step.purpose && <p>{step.purpose}</p>}
              <p>{text}</p>
            </>
          )}
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
          {step.id === "move" && showArrow && !anchor.hint && (
            <p>没有生成出兵单时，试试更近的目标，或加大出发能量。</p>
          )}
        </Body>
        <Footer>
          <Action
            type="button"
            disabled={index === startAt}
            onClick={() => {
              if (handoff) setCopyResult(undefined);
              else setIndex(index - 1);
            }}
          >
            上一步
          </Action>
          <NextAction type="button" onClick={advance}>
            {nextLabel}
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

const CommandText = styled.textarea`
  display: block;
  box-sizing: border-box;
  width: 100%;
  height: 74px;
  margin: 6px 0;
  padding: 5px 7px;
  border: 1px solid #43566a;
  background: #152130;
  color: inherit;
  font: 12px/1.4 monospace;
  resize: none;
  pointer-events: auto;
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
