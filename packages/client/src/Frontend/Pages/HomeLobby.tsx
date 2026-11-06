import type { FolderCard } from "@backend/Save/FolderCard";
import { aiproPriceLabel } from "@frontend/Components/ActionHistory";
import { useComponentValue } from "@latticexyz/react";
import { singletonEntity } from "@latticexyz/store-sync/recs";
import { useMUD } from "@mud/MUDContext";
import { useEffect, useMemo, useState } from "react";
import styled from "styled-components";

import dfstyles from "../Styles/dfstyles";
import { skillPack } from "./skillPack";
import type { HomeAssets } from "./useHomeAssets";

const Page = styled.main`
  position: fixed;
  inset: 0;
  z-index: 8;
  overflow: auto;
  background: radial-gradient(
      circle at 20% 10%,
      rgba(0, 220, 130, 0.08),
      transparent 28%
    ),
    ${dfstyles.colors.background};
  color: ${dfstyles.colors.text};
  font-family: "Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif;
`;

const Sheet = styled.div`
  width: min(1080px, calc(100% - 32px));
  margin: 0 auto;
  padding: 28px 0 48px;
  display: flex;
  flex-direction: column;
  gap: 18px;
`;

const Title = styled.h1`
  margin: 0;
  color: ${dfstyles.colors.dfgreen};
  font-family: "Start Press 2P", sans-serif;
  font-size: 22px;
  line-height: 1.6;
`;

const Lead = styled.p`
  max-width: 720px;
  margin: 8px 0 0;
  color: ${dfstyles.colors.subtext};
  font-size: 16px;
  line-height: 1.7;
`;

const Split = styled.section`
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap: 16px;

  @media (max-width: 800px) {
    grid-template-columns: 1fr;
  }
`;

const Card = styled.section`
  padding: 16px 18px;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid ${dfstyles.colors.border};
`;

const CardTitle = styled.h2`
  margin: 0 0 10px;
  color: ${dfstyles.colors.dfpink};
  font-size: 15px;
  font-weight: 600;
`;

const List = styled.ul`
  margin: 0;
  padding-left: 18px;
  color: ${dfstyles.colors.text};
  font-size: 14px;
  line-height: 1.7;
`;

const Stage = styled.section`
  position: relative;
  height: 320px;
  overflow: hidden;
  border: 1px solid ${dfstyles.colors.dfgreen};
  background: #070b0c;
`;

const Star = styled.span<{ x: number; y: number; size: number }>`
  position: absolute;
  left: ${(props) => props.x}%;
  top: ${(props) => props.y}%;
  width: ${(props) => props.size}px;
  height: ${(props) => props.size}px;
  border-radius: 50%;
  background: ${(props) =>
    props.size > 8 ? dfstyles.colors.dfgreen : "rgba(215, 255, 228, 0.85)"};
  box-shadow: 0 0 12px rgba(0, 220, 130, 0.45);
`;

const Hud = styled.div`
  position: absolute;
  top: 12px;
  right: 12px;
  width: 120px;
  height: 72px;
  border: 1px solid rgba(0, 220, 130, 0.35);
  background: rgba(0, 0, 0, 0.35);
`;

const Center = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
`;

const ImportButton = styled.button`
  min-width: 220px;
  padding: 14px 18px;
  border: 1px solid ${dfstyles.colors.dfgreen};
  background: rgba(0, 0, 0, 0.78);
  color: ${dfstyles.colors.dfgreen};
  font-family: "Start Press 2P", sans-serif;
  font-size: 12px;
  line-height: 1.6;
  cursor: pointer;

  &:hover {
    background: rgba(0, 220, 130, 0.16);
  }
`;

const ChangeButton = styled.button`
  border: none;
  background: none;
  color: ${dfstyles.colors.subtext};
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
`;

const FolderName = styled.div`
  color: ${dfstyles.colors.text};
  font-size: 13px;
`;

const Facts = styled.section`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;

  @media (max-width: 980px) {
    grid-template-columns: 1fr 1fr;
  }

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

const SkillRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const SkillLink = styled.a`
  color: ${dfstyles.colors.dfgreen};
  font-size: 14px;
  word-break: break-all;
`;

const CopyButton = styled.button`
  padding: 6px 10px;
  border: 1px solid ${dfstyles.colors.dfgreen};
  background: transparent;
  color: ${dfstyles.colors.dfgreen};
  font: inherit;
  cursor: pointer;
`;

const FactLine = styled.div`
  margin-top: 6px;
  font-size: 13px;
  line-height: 1.6;
  word-break: break-all;
`;

const stars = [
  { x: 12, y: 24, size: 4 },
  { x: 22, y: 62, size: 14 },
  { x: 70, y: 30, size: 10 },
  { x: 82, y: 68, size: 5 },
  { x: 38, y: 18, size: 3 },
  { x: 58, y: 74, size: 6 },
];

function shortAddress(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function whole(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) {
    return "读取中";
  }
  return Math.round(value).toLocaleString("zh-CN");
}

function useMatchFacts(): { tick?: number; players?: number } {
  const {
    components: { Ticker, GlobalStats },
  } = useMUD();
  const ticker = useComponentValue(Ticker, singletonEntity);
  const stats = useComponentValue(GlobalStats, singletonEntity);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (!ticker) {
    return {
      players: stats ? Number(stats.spawnPlayerCount) : undefined,
    };
  }
  const rate = Number(ticker.tickRate);
  const storedTick = Number(ticker.tickNumber);
  const storedTime = Number(ticker.timestamp);
  const tick = ticker.paused
    ? storedTick
    : storedTick + (now - storedTime) * rate;
  return {
    tick,
    players: stats ? Number(stats.spawnPlayerCount) : undefined,
  };
}

function GameData({
  season,
  tick,
  players,
}: {
  season?: number;
  tick?: number;
  players?: number;
}) {
  return (
    <>
      <FactLine>
        赛季 {season === undefined ? "未开放" : `第 ${season} 季`}
      </FactLine>
      <FactLine>tick {whole(tick)}</FactLine>
      <FactLine>玩家数 {whole(players)}</FactLine>
    </>
  );
}

function AgentSkill() {
  const [copied, setCopied] = useState(false);
  const skillUrl = useMemo(
    () => URL.createObjectURL(new Blob([skillPack], { type: "text/markdown" })),
    [],
  );

  useEffect(() => {
    return () => URL.revokeObjectURL(skillUrl);
  }, [skillUrl]);

  return (
    <>
      <SkillRow>
        <SkillLink href={skillUrl} target="_blank" rel="noreferrer">
          darkforest-local-session
        </SkillLink>
        <CopyButton
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(skillPack).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            });
          }}
        >
          {copied ? "已复制" : "复制"}
        </CopyButton>
      </SkillRow>
      <FactLine>复制这段 skill，交给你的 agent。</FactLine>
    </>
  );
}

export function HomeLobby({
  card,
  assets,
  onImport,
  onChangeFolder,
}: {
  card?: FolderCard;
  assets: HomeAssets;
  onImport: () => void;
  onChangeFolder: () => void;
}) {
  const match = useMatchFacts();

  return (
    <Page>
      <Sheet>
        <header>
          <Title>Dark Forest Punk</Title>
          <Lead>
            不完全信息的链上星际策略。整张星图不公开，坐标留在钱包目录里，行动用证明在链上结算。
          </Lead>
        </header>

        <Split>
          <Card>
            <CardTitle>怎么玩</CardTitle>
            <List>
              <li>从家出发，在本地把周围的星球挖出来。</li>
              <li>派出舰队占领星球，搬运能量和银。</li>
              <li>银进入 Nutbox 矿池，按质押份额领取 AIPRO。</li>
              <li>通行证 NFT 把这只钱包绑进当前赛季。</li>
            </List>
          </Card>
          <Card>
            <CardTitle>Agent 怎么接</CardTitle>
            <AgentSkill />
          </Card>
        </Split>

        <Stage aria-label="游戏界面缩略图">
          {stars.map((star) => (
            <Star key={`${star.x}-${star.y}`} {...star} />
          ))}
          <Hud />
          <Center>
            <ImportButton type="button" onClick={onImport}>
              导入游戏数据
            </ImportButton>
            {card && (
              <>
                <FolderName>当前目录 {card.folderName}</FolderName>
                <ChangeButton type="button" onClick={onChangeFolder}>
                  更换数据文件夹
                </ChangeButton>
              </>
            )}
          </Center>
        </Stage>

        <Facts>
          <Card>
            <CardTitle>游戏数据</CardTitle>
            <GameData
              season={assets.season}
              tick={match.tick}
              players={match.players}
            />
          </Card>
          <Card>
            <CardTitle>Nutbox 矿池</CardTitle>
            <FactLine>{assets.poolNote}</FactLine>
            {assets.pools.map((pool) => (
              <FactLine key={pool.address}>
                {pool.label} {shortAddress(pool.address)}
                <br />
                总质押 {pool.totalStaked}
                {pool.userStaked ? ` · 我的 ${pool.userStaked}` : ""}
              </FactLine>
            ))}
          </Card>
          <Card>
            <CardTitle>{assets.tokenSymbol}</CardTitle>
            <FactLine>
              {assets.tokenAddress
                ? shortAddress(assets.tokenAddress)
                : "支付代币还没配置"}
            </FactLine>
            <FactLine>
              余额{" "}
              {assets.tokenBalance ?? (card?.address ? "读取中" : "导入后显示")}
            </FactLine>
            <FactLine>价格 {aiproPriceLabel(card?.priceText)}</FactLine>
            {assets.pendingRewards && (
              <FactLine>待领取 {assets.pendingRewards}</FactLine>
            )}
          </Card>
          <Card>
            <CardTitle>NFT</CardTitle>
            <FactLine>{assets.seasonLabel}</FactLine>
            {assets.nfts.length === 0 ? (
              <FactLine>链上还没有可展示的 NFT。</FactLine>
            ) : (
              assets.nfts.map((nft) => (
                <FactLine key={nft.label}>
                  {nft.label}
                  {nft.symbol ? ` ${nft.symbol}` : ""}
                  <br />
                  持有{" "}
                  {nft.balance ?? (card?.address ? "读取中" : "导入后显示")}
                  {nft.tokenIds.length > 0 ? ` ${nft.tokenIds.join(" ")}` : ""}
                </FactLine>
              ))
            )}
          </Card>
        </Facts>
      </Sheet>
    </Page>
  );
}
