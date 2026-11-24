import type { FolderCard } from "@backend/Save/FolderCard";
import { useComponentValue } from "@latticexyz/react";
import { singletonEntity } from "@latticexyz/store-sync/recs";
import { useMUD } from "@mud/MUDContext";
import { useMemo, useState } from "react";
import styled from "styled-components";

import dfstyles from "../Styles/dfstyles";
import { DocsCorner } from "./docs/DocsCorner";
import { HomeLeaderboardPanel } from "./HomeLeaderboardPanel";
import { skillPublicBasePath } from "./skillPack";
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

const Header = styled.header`
  /* 右上角文档按钮盖在页面上，标题让出这一侧 */
  padding-right: 88px;
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

const ButtonRow = styled.div`
  display: flex;
  flex-wrap: wrap;
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

function explorerAddress(chainId: number, address: string): string {
  if (chainId === 56) return `https://bscscan.com/address/${address}`;
  return `https://etherscan.io/address/${address}`;
}

const AddrLink = styled.a`
  color: ${dfstyles.colors.dfgreen};
  text-decoration: none;
  word-break: break-all;

  &:hover {
    text-decoration: underline;
  }
`;

function whole(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) {
    return "读取中";
  }
  return Math.round(value).toLocaleString("zh-CN");
}

/** 与 df.config.toml [inner_circle].a_radius 一致：开局内圈半径。 */
const INNER_CIRCLE_START = 75000;

function useMatchFacts(): {
  shrinkPct?: number;
  maxPlanetLevel?: number;
  players?: number;
} {
  const {
    components: { InnerCircle, SilverFrontier, GlobalStats },
  } = useMUD();
  const circle = useComponentValue(InnerCircle, singletonEntity);
  const frontier = useComponentValue(SilverFrontier, singletonEntity);
  const stats = useComponentValue(GlobalStats, singletonEntity);

  let shrinkPct: number | undefined;
  if (circle) {
    const radius = Number(circle.radius);
    shrinkPct = Math.min(
      100,
      Math.max(0, ((INNER_CIRCLE_START - radius) / INNER_CIRCLE_START) * 100),
    );
  }

  return {
    shrinkPct,
    maxPlanetLevel: frontier ? Number(frontier.level) : undefined,
    players: stats ? Number(stats.spawnPlayerCount) : undefined,
  };
}

function GameData({
  shrinkPct,
  maxPlanetLevel,
  players,
}: {
  shrinkPct?: number;
  maxPlanetLevel?: number;
  players?: number;
}) {
  return (
    <>
      <FactLine>
        内圈收缩{" "}
        {shrinkPct === undefined ? "读取中" : `${shrinkPct.toFixed(1)}%`}
      </FactLine>
      <FactLine>最高星球等级 {whole(maxPlanetLevel)}</FactLine>
      <FactLine>玩家数 {whole(players)}</FactLine>
      <FactLine>排行榜</FactLine>
      <HomeLeaderboardPanel previewLimit={5} framed={false} showTitle={false} />
    </>
  );
}

function AgentSkill() {
  const [copied, setCopied] = useState(false);
  // 目录链接：agent 从这里按文件拉全包；复制与打开同一地址。
  const skillBaseUrl = useMemo(
    () =>
      typeof window === "undefined"
        ? skillPublicBasePath
        : new URL(skillPublicBasePath, window.location.origin).href,
    [],
  );

  return (
    <SkillRow>
      <SkillLink href={skillBaseUrl} target="_blank" rel="noreferrer">
        darkforest-punk-player
      </SkillLink>
      <CopyButton
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(skillBaseUrl).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          });
        }}
      >
        {copied ? "已复制链接" : "复制链接"}
      </CopyButton>
    </SkillRow>
  );
}

const Notice = styled.p`
  position: absolute;
  right: 16px;
  bottom: 12px;
  left: 16px;
  margin: 0;
  padding: 10px 14px;
  border: 1px solid ${dfstyles.colors.dfgreen};
  background: rgba(0, 0, 0, 0.92);
  color: ${dfstyles.colors.dfgreen};
  font-size: 15px;
  line-height: 1.6;
  text-align: center;
`;

export function HomeLobby({
  card,
  assets,
  notice,
  importing,
  onImport,
  onChangeFolder,
}: {
  card?: FolderCard;
  assets: HomeAssets;
  notice?: string;
  importing: boolean;
  onImport: () => void;
  onChangeFolder: () => void;
}) {
  const match = useMatchFacts();
  const {
    network: { publicClient },
  } = useMUD();
  const chainId = publicClient.chain?.id ?? 56;

  return (
    <Page>
      <DocsCorner />
      <Sheet>
        <Header>
          <Title>Dark Forest Punk</Title>
          <Lead>
            不完全信息的链上星际策略。整张星图不公开，坐标留在钱包目录里，行动用证明在链上结算。
          </Lead>
        </Header>

        <Split>
          <Card>
            <CardTitle>如何开始</CardTitle>
            <AgentSkill />
          </Card>
          <Card>
            <CardTitle>怎么玩</CardTitle>
            <List>
              <li>从家出发，在本地探索周围的星球。</li>
              <li>派出舰队占领星球，搬运能量和银。</li>
              <li>银进入 Nutbox 矿池，按质押份额领取奖励。</li>
              <li>
                有 Binance handle 的钱包，把 Game Pass NFT
                质押进这局游戏才能玩。
              </li>
            </List>
          </Card>
        </Split>

        <Stage aria-label="游戏界面缩略图">
          {stars.map((star) => (
            <Star key={`${star.x}-${star.y}`} {...star} />
          ))}
          <Hud />
          <Center>
            <ButtonRow>
              <ImportButton
                type="button"
                disabled={importing}
                onClick={onImport}
              >
                {importing ? "正在读取" : "导入游戏数据"}
              </ImportButton>
            </ButtonRow>
            {notice && <Notice role="status">{notice}</Notice>}
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
              shrinkPct={match.shrinkPct}
              maxPlanetLevel={match.maxPlanetLevel}
              players={match.players}
            />
          </Card>
          <Card>
            <CardTitle>Nutbox 矿池</CardTitle>
            <FactLine>{assets.poolNote}</FactLine>
            {assets.pools.map((pool) => (
              <FactLine key={pool.address}>
                {pool.label}
                <br />
                合约{" "}
                <AddrLink
                  href={explorerAddress(chainId, pool.address)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {pool.address}
                </AddrLink>
                <br />
                质押数量 {pool.totalStaked}
                <br />
                每小时奖励 {pool.hourlyReward ?? "读不到"}
              </FactLine>
            ))}
          </Card>
          <Card>
            <CardTitle>{assets.tokenSymbol}</CardTitle>
            <FactLine>
              {assets.tokenAddress ? (
                <AddrLink
                  href={explorerAddress(chainId, assets.tokenAddress)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {shortAddress(assets.tokenAddress)}
                </AddrLink>
              ) : (
                "支付代币还没配置"
              )}
            </FactLine>
            <FactLine>已销毁 {assets.burnedAmount ?? "读取中"}</FactLine>
            <FactLine>价格 {assets.tokenPrice ?? "读取中"}</FactLine>
            <FactLine>FDV {assets.tokenFdv ?? "读取中"}</FactLine>
          </Card>
          <Card>
            <CardTitle>NFT</CardTitle>
            {assets.nfts.length === 0 ? (
              <FactLine>链上还没有可展示的 NFT。</FactLine>
            ) : (
              assets.nfts.map((nft) => (
                <FactLine key={nft.label}>
                  {nft.label}
                  {nft.symbol ? ` ${nft.symbol}` : ""}
                  <br />
                  总发行量 {nft.maxSupply ?? "读不到"}
                  <br />
                  已发行 {nft.minted ?? "读不到"}
                </FactLine>
              ))
            )}
          </Card>
        </Facts>
      </Sheet>
    </Page>
  );
}
