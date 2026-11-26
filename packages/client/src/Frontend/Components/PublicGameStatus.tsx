import { EMPTY_ADDRESS } from "@df/constants";
import { formatWholeToken } from "@df/gamelogic";
import type { Planet } from "@df/types";
import { useComponentValue } from "@latticexyz/react";
import { singletonEntity } from "@latticexyz/store-sync/recs";
import { useMUD } from "@mud/MUDContext";
import { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { type Address, parseAbi } from "viem";

import {
  copyText,
  formatClaimCommunityOrder,
  formatClaimRewardsOrder,
} from "../../Backend/GameLogic/moveOrder";
import Viewport from "../Game/Viewport";
import { useUIManager } from "../Utils/AppHooks";
import UIEmitter, {
  type GuidedOrderKind,
  UIEmitterEvent,
} from "../Utils/UIEmitter";
import { BuyJunkOrderPanel } from "./BuyJunkOrderPanel";
import {
  collectOwnedArtifacts,
  type OwnedArtifactLine,
} from "./ownedArtifacts";
import {
  heldByAccount,
  MATERIAL_NAME,
  OwnedArtifactsPanel,
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
  background: linear-gradient(155deg, rgb(19 32 51 / 97%), rgb(10 17 29 / 97%));
  border: 1px solid #2b4058;
  border-radius: 9px;
  box-shadow: 0 12px 32px rgb(2 5 12 / 36%);
  color: #dce8f6;
  font-family: system-ui, "PingFang SC", sans-serif;
  font-size: 12px;
  line-height: 1.7;
  font-variant-numeric: tabular-nums;
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

const TitleRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: 10px;

  &[data-expanded="true"] {
    margin-bottom: 8px;
    padding-bottom: 7px;
    border-bottom: 1px solid #26374c;
  }
`;

const Title = styled.div`
  color: #f0f6ff;
  font-size: 14px;
  font-weight: 700;
`;

const BoundaryRadius = styled.div`
  color: #ffbf9b;
`;

const RewardLine = styled.div`
  display: flex;
  align-items: baseline;
  gap: 6px;
`;

const RefreshButton = styled.button`
  background: none;
  border: none;
  padding: 0;
  color: #9be7ff;
  font: inherit;
  cursor: pointer;
  text-decoration: underline;

  &:disabled {
    color: #6d7b8c;
    cursor: default;
    text-decoration: none;
  }
`;

// 标题行最右边的收起/展开开关，用 margin-left:auto 推到右端
const CollapseButton = styled.button`
  margin-left: auto;
  background: none;
  border: none;
  padding: 0;
  color: #9be7ff;
  font: inherit;
  cursor: pointer;
  text-decoration: underline;
`;

const ClaimButton = styled.button`
  background: none;
  border: none;
  padding: 0;
  color: #9be7ff;
  font: inherit;
  cursor: pointer;
  text-decoration: underline;

  &:disabled {
    color: #6d7b8c;
    cursor: default;
    text-decoration: none;
  }
`;

// 垃圾额度和购买按钮排在同一行。
const JunkLine = styled(RewardLine)``;

const OpenButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 4px 8px;
  background: #14263b;
  border: 1px solid #2c435d;
  border-radius: 5px;
  color: #d8eafb;
  font: inherit;
  cursor: pointer;
  text-align: left;

  span {
    margin-left: auto;
    color: #a6d8f3;
  }

  &::after {
    content: "";
    width: 5px;
    height: 5px;
    border-right: 1px solid #8fb9d3;
    border-top: 1px solid #8fb9d3;
    transform: rotate(45deg);
  }

  &:hover,
  &[aria-expanded="true"] {
    background: #203b55;
    border-color: #496984;
  }

  &:focus-visible {
    outline: 2px solid #8bdfff;
    outline-offset: 1px;
  }
`;

const AssetButtons = styled.div`
  display: grid;
  gap: 5px;
  margin-block: 6px;
`;

type MaterialLine = {
  name: string;
  amount: number;
};

type WalletFacts = {
  users?: number;
  planetCount: number;
  artifacts: OwnedArtifactLine[];
  energy?: number;
  silver?: number;
  // 链上 junk 就是额度。0 级星球占 50，出生上限是 1000。这里不要再除以 1000。
  junkUsed?: number;
  junkLimit?: number;
  // PlayerScore 与提取量同一单位。这里除以 1000，和银的显示一致。
  score?: number;
  materials: MaterialLine[];
};

const EMPTY_FACTS: WalletFacts = {
  planetCount: 0,
  artifacts: [],
  materials: [],
};

const REWARD_ABI = parseAbi([
  "function getPendingExternalRewards(address user) view returns (uint256)",
  "function getPendingCommunityRewards(address user) view returns (uint256)",
]);

type RewardRead = {
  pool: Address;
  community?: Address;
  game: bigint;
  communityPending?: bigint;
};

// 待领是 18 位的 wei；页面只显示整枚 AIPRO。
function wholeAipro(wei: bigint): string {
  return formatWholeToken(wei);
}

function whole(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) {
    return "...";
  }
  return Math.round(value).toLocaleString("zh-CN");
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

const COLLAPSED_KEY = "df.publicStatus.collapsed";

/** 读上次是否收起；隐私模式等读不到本地存储时当作展开。 */
function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function saveCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    // 存不了就只在本次页面里生效
  }
}

export function PublicGameStatus({
  homeReady,
  onOpenGuide,
}: {
  homeReady: boolean;
  onOpenGuide: () => void;
}) {
  const uiManager = useUIManager();
  const [innerRadius, setInnerRadius] = useState<number | undefined>();
  const [tick, setTick] = useState<number | undefined>();
  const [facts, setFacts] = useState<WalletFacts>(EMPTY_FACTS);
  // 右上角面板是否收起。记在本地，刷新页面后保持上次的选择。
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggleCollapsed = () => {
    setCollapsed((current) => {
      saveCollapsed(!current);
      return !current;
    });
  };
  const [planetsOpen, setPlanetsOpen] = useState(false);
  const [artifactsOpen, setArtifactsOpen] = useState(false);
  const [junkBuyOpen, setJunkBuyOpen] = useState(false);
  const [reward, setReward] = useState<RewardRead | undefined>();
  const [refreshing, setRefreshing] = useState(false);
  const seenFacts = useRef("");
  const rewardRead = useRef<(() => Promise<void>) | undefined>(undefined);
  const rewardSeq = useRef(0);
  const {
    network: { publicClient },
    components: { DFXStarConfig },
  } = useMUD();
  const star = useComponentValue(DFXStarConfig, singletonEntity);
  const pool = star?.scoreStakingPool;
  const community = star?.community;

  // 两种待领都不在星球同步里。平时 30 秒读一次，刷新按钮立刻再读。
  useEffect(() => {
    let stopped = false;
    const read = async () => {
      const mine = ++rewardSeq.current;
      const account = uiManager.getAccount();
      if (!pool || pool === EMPTY_ADDRESS || !account) {
        if (!stopped && mine === rewardSeq.current) {
          setReward(undefined);
        }
        return;
      }
      const poolAddress = pool as Address;
      const communityAddress =
        community && community !== EMPTY_ADDRESS
          ? (community as Address)
          : undefined;
      try {
        const game = await publicClient.readContract({
          address: poolAddress,
          abi: REWARD_ABI,
          functionName: "getPendingExternalRewards",
          args: [account as Address],
        });
        let communityPending: bigint | undefined;
        if (communityAddress) {
          communityPending = await publicClient.readContract({
            address: poolAddress,
            abi: REWARD_ABI,
            functionName: "getPendingCommunityRewards",
            args: [account as Address],
          });
        }
        if (!stopped && mine === rewardSeq.current) {
          setReward({
            pool: poolAddress,
            community: communityAddress,
            game,
            communityPending,
          });
        }
      } catch {
        if (!stopped && mine === rewardSeq.current) {
          setReward(undefined);
        }
      }
    };
    rewardRead.current = read;
    void read();
    const timer = window.setInterval(() => void read(), 30_000);
    return () => {
      stopped = true;
      rewardRead.current = undefined;
      window.clearInterval(timer);
    };
  }, [community, pool, publicClient, uiManager]);

  const refresh = () => {
    if (refreshing) {
      return;
    }
    setRefreshing(true);
    // 清掉签名，下一帧会把半径、tick、分数这些本地数字重写一遍。
    seenFacts.current = "";
    void Promise.resolve(rewardRead.current?.()).finally(() => {
      setRefreshing(false);
    });
  };

  const copyOrder = (text: string, label: string, kind?: GuidedOrderKind) => {
    void copyText(text).then((copied) => {
      UIEmitter.getInstance().emit(UIEmitterEvent.MoveOrderCopied, {
        text,
        copied,
        label,
        kind,
      });
    });
  };

  useEffect(() => {
    let framed = false;
    let stopped = false;
    let keptRadius: number | undefined;
    let keptTick: number | undefined;
    const read = () => {
      if (stopped) {
        return;
      }
      let nextRadius = keptRadius;
      let nextTick = keptTick;
      try {
        nextRadius = Math.round(uiManager.getInnerRadius());
        nextTick = uiManager.getCurrentTick();
        keptRadius = nextRadius;
        keptTick = nextTick;
        if (!homeReady && !framed && nextRadius > 0) {
          Viewport.getInstance().focus({ x: 0, y: 0 }, nextRadius * 2.4);
          framed = true;
        }
      } catch {
        // 画面或内圈表还没准备好。
      }

      const next: WalletFacts = {
        planetCount: 0,
        artifacts: [],
        materials: [],
      };
      try {
        next.users = uiManager.getSpawnedPlayerCount();
      } catch {
        // GlobalStats 还没同步到。
      }
      try {
        const account = uiManager.getAccount()?.toLowerCase();
        if (account) {
          const held = heldByAccount(uiManager.getAllOwnedPlanets(), account);
          next.planetCount = held.length;
          const game = uiManager.getGameManager();
          next.artifacts = collectOwnedArtifacts(
            held,
            (id) => game.getArtifactWithId(id),
            game.getMyArtifacts(),
            (id) => game.getPlanetWithId(id),
            account,
          );
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
        next.users,
        next.planetCount,
        next.artifacts
          .map(
            (artifact) =>
              `${artifact.id}:${artifact.name}:${artifact.rarity}:${artifact.place}:${artifact.planetId ?? ""}`,
          )
          .join(","),
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
        <TitleRow data-expanded={!collapsed}>
          <Title>游戏信息</Title>
          <RefreshButton type="button" disabled={refreshing} onClick={refresh}>
            {refreshing ? "刷新中" : "刷新"}
          </RefreshButton>
          <RefreshButton type="button" onClick={onOpenGuide}>
            新手指引
          </RefreshButton>
          <CollapseButton
            type="button"
            data-guide-target={collapsed ? "expand-status" : undefined}
            aria-expanded={!collapsed}
            onClick={toggleCollapsed}
          >
            {collapsed ? "展开" : "收起"}
          </CollapseButton>
        </TitleRow>
        {!collapsed && (
          <>
            <BoundaryRadius>收缩圈半径 {innerRadius ?? "..."}</BoundaryRadius>
            <div>当前 tick {tick ?? "..."}</div>
            <div>总用户 {whole(facts.users)}</div>
            <AssetButtons>
              <OpenButton
                type="button"
                data-guide-target="owned-planets"
                aria-expanded={planetsOpen}
                onClick={() => {
                  setArtifactsOpen(false);
                  setJunkBuyOpen(false);
                  setPlanetsOpen((open) => !open);
                }}
              >
                占领星球 <span>{facts.planetCount}</span>
              </OpenButton>
              <OpenButton
                type="button"
                aria-expanded={artifactsOpen}
                onClick={() => {
                  setPlanetsOpen(false);
                  setJunkBuyOpen(false);
                  setArtifactsOpen((open) => !open);
                }}
              >
                拥有神器 <span>{facts.artifacts.length}</span>
              </OpenButton>
            </AssetButtons>
            <JunkLine>
              <span>
                垃圾额度 {whole(facts.junkUsed)} / {whole(facts.junkLimit)}
              </span>
              <ClaimButton
                type="button"
                data-guide-target="buy-junk"
                disabled={facts.junkLimit === undefined}
                onClick={() => {
                  setPlanetsOpen(false);
                  setArtifactsOpen(false);
                  setJunkBuyOpen(true);
                }}
              >
                购买
              </ClaimButton>
            </JunkLine>
            <div>分数 {whole(facts.score)}</div>
            <RewardLine data-guide-target="game-rewards">
              <span>
                游戏奖励：{reward ? wholeAipro(reward.game) : "..."} AIPRO
              </span>
              <ClaimButton
                type="button"
                data-guide-target="claim-game-rewards"
                disabled={!reward || reward.game === 0n}
                onClick={() => {
                  if (!reward || reward.game === 0n) {
                    return;
                  }
                  copyOrder(
                    formatClaimRewardsOrder({
                      pool: reward.pool,
                      pendingWei: reward.game,
                    }),
                    "已复制游戏奖励领取单，直接粘贴给 agent",
                    "claim-rewards",
                  );
                }}
              >
                领取
              </ClaimButton>
            </RewardLine>
            <RewardLine>
              <span>
                社区奖励：
                {reward?.communityPending === undefined
                  ? "..."
                  : wholeAipro(reward.communityPending)}{" "}
                AIPRO
              </span>
              <ClaimButton
                type="button"
                disabled={
                  !reward?.community ||
                  reward.communityPending === undefined ||
                  reward.communityPending === 0n
                }
                onClick={() => {
                  if (
                    !reward?.community ||
                    reward.communityPending === undefined ||
                    reward.communityPending === 0n
                  ) {
                    return;
                  }
                  copyOrder(
                    formatClaimCommunityOrder({
                      community: reward.community,
                      pool: reward.pool,
                      pendingWei: reward.communityPending,
                    }),
                    "已复制社区奖励领取单，直接粘贴给 agent",
                  );
                }}
              >
                领取
              </ClaimButton>
            </RewardLine>
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
          </>
        )}
      </Panel>
      {planetsOpen && (
        <OwnedPlanetsPanel onClose={() => setPlanetsOpen(false)} />
      )}
      {artifactsOpen && (
        <OwnedArtifactsPanel
          artifacts={facts.artifacts}
          onClose={() => setArtifactsOpen(false)}
        />
      )}
      {junkBuyOpen && (
        <BuyJunkOrderPanel
          junkLimit={facts.junkLimit}
          onCopy={(text, label) => copyOrder(text, label, "buy-junk")}
          onClose={() => setJunkBuyOpen(false)}
        />
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
