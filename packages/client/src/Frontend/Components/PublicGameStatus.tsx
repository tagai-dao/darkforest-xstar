import type { Planet } from "@df/types";
import { useEffect, useRef, useState } from "react";
import styled from "styled-components";

import Viewport from "../Game/Viewport";
import { useUIManager } from "../Utils/AppHooks";
import { aiproPriceLabel } from "./ActionHistory";
import {
  heldByAccount,
  MATERIAL_NAME,
  OwnedPlanetsPanel,
} from "./OwnedPlanetsPanel";

const Panel = styled.div`
  position: fixed;
  top: 52px;
  right: 16px;
  z-index: 6;
  min-width: 240px;
  max-width: 360px;
  padding: 12px 14px;
  background: rgba(0, 0, 0, 0.82);
  color: #d7ffe4;
  font-family: "Start Press 2P", sans-serif;
  font-size: 10px;
  line-height: 1.7;
`;

const HomeNotice = styled.div`
  position: fixed;
  top: 72px;
  left: 50%;
  z-index: 6;
  transform: translateX(-50%);
  max-width: 520px;
  padding: 14px 16px;
  background: rgba(40, 16, 16, 0.92);
  color: #ffd0d0;
  font-family: "Start Press 2P", sans-serif;
  font-size: 11px;
  line-height: 1.8;
  text-align: center;
`;

const OpenButton = styled.button`
  background: none;
  border: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
  padding: 0;
  text-align: left;
  text-decoration: underline;
`;

type MaterialLine = {
  name: string;
  amount: number;
};

type WalletFacts = {
  users?: number;
  chunks?: number;
  planetCount: number;
  energy?: number;
  silver?: number;
  // 链上 junk 就是额度。0 级星球占 50，出生上限是 1000。这里不要再除以 1000。
  junkUsed?: number;
  junkLimit?: number;
  // PlayerScore 与提取量同一单位。这里除以 1000，和银的显示一致。
  score?: number;
  materials: MaterialLine[];
};

const EMPTY_FACTS: WalletFacts = { planetCount: 0, materials: [] };

function whole(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) {
    return "...";
  }
  return Math.round(value).toLocaleString("zh-CN");
}

function junkRemaining(
  used: number | undefined,
  limit: number | undefined,
): number | undefined {
  if (used === undefined || limit === undefined) {
    return undefined;
  }
  return Math.max(0, limit - used);
}

function countChunks(chunks: Iterable<unknown>): number {
  let count = 0;
  for (const _chunk of chunks) {
    count += 1;
  }
  return count;
}

function sumMaterials(planets: Planet[]): MaterialLine[] {
  const totals = new Map<number, number>();
  for (const planet of planets) {
    for (const material of planet.materials ?? []) {
      if (material.materialAmount <= 0) {
        continue;
      }
      totals.set(
        material.materialId,
        (totals.get(material.materialId) ?? 0) + material.materialAmount,
      );
    }
  }
  return [...totals.entries()].map(([id, amount]) => ({
    name: MATERIAL_NAME[id] ?? `材料${id}`,
    amount,
  }));
}

export function PublicGameStatus({
  homeReady,
  priceText,
}: {
  homeReady: boolean;
  priceText?: string;
}) {
  const uiManager = useUIManager();
  const [innerRadius, setInnerRadius] = useState<number | undefined>();
  const [tick, setTick] = useState<number | undefined>();
  const [worldRadius, setWorldRadius] = useState<number | undefined>();
  const [facts, setFacts] = useState<WalletFacts>(EMPTY_FACTS);
  const [planetsOpen, setPlanetsOpen] = useState(false);
  const seenFacts = useRef("");

  useEffect(() => {
    let framed = false;
    let stopped = false;
    let keptRadius: number | undefined;
    let keptTick: number | undefined;
    let keptWorld: number | undefined;
    const read = () => {
      if (stopped) {
        return;
      }
      let nextRadius = keptRadius;
      let nextTick = keptTick;
      let nextWorld = keptWorld;
      try {
        nextRadius = Math.round(uiManager.getInnerRadius());
        nextTick = uiManager.getCurrentTick();
        nextWorld = uiManager.getWorldRadius();
        keptRadius = nextRadius;
        keptTick = nextTick;
        keptWorld = nextWorld;
        if (!homeReady && !framed && nextRadius > 0) {
          Viewport.getInstance().focus({ x: 0, y: 0 }, nextRadius * 2.4);
          framed = true;
        }
      } catch {
        // 画面或内圈表还没准备好。
      }

      const next: WalletFacts = { planetCount: 0, materials: [] };
      try {
        next.users = uiManager.getSpawnedPlayerCount();
      } catch {
        // GlobalStats 还没同步到。
      }
      try {
        next.chunks = countChunks(uiManager.getExploredChunks());
        const account = uiManager.getAccount()?.toLowerCase();
        if (account) {
          const held = heldByAccount(uiManager.getAllOwnedPlanets(), account);
          next.planetCount = held.length;
          next.energy = held.reduce((sum, planet) => sum + planet.energy, 0);
          next.silver = held.reduce((sum, planet) => sum + planet.silver, 0);
          next.materials = sumMaterials(held);
          const player = uiManager.getGameManager().getPlayer(account);
          if (player) {
            next.junkUsed = player.junk;
            next.junkLimit = player.junkLimit;
            if (player.score !== undefined) {
              next.score = Math.floor(player.score / 1000);
            }
          }
        }
      } catch {
        // 钱包或星球列表还没建好。
      }
      const signature = [
        nextRadius,
        nextTick,
        nextWorld,
        next.users,
        next.chunks,
        next.planetCount,
        next.junkUsed,
        next.junkLimit,
        next.score,
        next.energy,
        next.silver,
        next.materials
          .map((material) => `${material.name}:${material.amount}`)
          .join(","),
      ].join("|");
      if (signature !== seenFacts.current) {
        seenFacts.current = signature;
        setInnerRadius(nextRadius);
        setTick(nextTick);
        setWorldRadius(nextWorld);
        setFacts(next);
      }
      requestAnimationFrame(read);
    };
    read();
    return () => {
      stopped = true;
    };
  }, [homeReady, uiManager]);

  return (
    <>
      <Panel data-public-status>
        <div>相关信息</div>
        <div>AIPRO 价格 {aiproPriceLabel(priceText)}</div>
        <div>收缩圈半径 {innerRadius ?? "..."}</div>
        <div>世界半径 {worldRadius ?? "..."}</div>
        <div>当前 tick {tick ?? "..."}</div>
        <div>{homeReady ? "家已写入存档" : "家尚未初始化"}</div>
        <div>总用户 {whole(facts.users)}</div>
        <div>已挖块 {whole(facts.chunks)}</div>
        <OpenButton type="button" onClick={() => setPlanetsOpen(true)}>
          占领星球 {facts.planetCount}
        </OpenButton>
        <div>
          垃圾额度 {whole(facts.junkUsed)} / {whole(facts.junkLimit)}
        </div>
        <div>
          可用额度 {whole(junkRemaining(facts.junkUsed, facts.junkLimit))}
        </div>
        <div>分数 {whole(facts.score)}</div>
        <div>能量 {whole(facts.energy)}</div>
        <div>银 {whole(facts.silver)}</div>
        {facts.materials.length === 0 ? (
          <div>材料 无</div>
        ) : (
          facts.materials.map((material) => (
            <div key={material.name}>
              {material.name} {whole(material.amount)}
            </div>
          ))
        )}
      </Panel>
      {planetsOpen && (
        <OwnedPlanetsPanel onClose={() => setPlanetsOpen(false)} />
      )}
      {!homeReady && (
        <HomeNotice>
          家还没有初始化。请让 agent 先注册并出生，写好 homeLocations.json
          之后，这一页会自动定位到家。
        </HomeNotice>
      )}
    </>
  );
}
