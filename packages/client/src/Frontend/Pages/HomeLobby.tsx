import { copyText } from "@backend/GameLogic/moveOrder";
import { formatWholeToken } from "@df/gamelogic";
import type { FolderCard } from "@backend/Save/FolderCard";
import { getNetworkConfig } from "@mud/getNetworkConfig";
import { useMUD } from "@mud/MUDContext";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import styled, { css } from "styled-components";
import type { Address, PublicClient } from "viem";

import { HomeLeaderboardPanel } from "./HomeLeaderboardPanel";
import {
  nftPurchaseInstructions,
  parsePurchaseAmount,
  quoteHomeTokenBuy,
  tokenPurchaseInstructions,
} from "./homePurchases";
import { skillPublicBasePath } from "./skillPack";
import type { HomeAssets } from "./useHomeAssets";

function whole(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "读取中";
  return Math.round(value).toLocaleString("zh-CN");
}

function AddressLink({
  chainId,
  address,
}: {
  chainId: number;
  address: string;
}) {
  const explorer =
    chainId === 56 ? "https://bscscan.com" : "https://etherscan.io";
  return (
    <AddrLink
      href={`${explorer}/address/${address}`}
      title={address}
      target="_blank"
      rel="noreferrer"
    >
      {address.slice(0, 6)}…{address.slice(-4)}
      <span aria-hidden="true"> ↗</span>
    </AddrLink>
  );
}

function CopyCommand({
  label,
  copiedLabel = "已复制指令",
  instruction,
}: {
  label: string;
  copiedLabel?: string;
  instruction?: () => string;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (status !== "copied") return;
    const timer = window.setTimeout(() => setStatus("idle"), 3000);
    return () => window.clearTimeout(timer);
  }, [status]);

  const copy = async () => {
    if (instruction)
      setStatus((await copyText(instruction())) ? "copied" : "failed");
  };

  return (
    <CopyArea>
      <CopyButton
        type="button"
        disabled={!instruction}
        onClick={() => void copy()}
      >
        {status === "copied" ? copiedLabel : label}
        <span aria-hidden="true">{status === "copied" ? "✓" : "↗"}</span>
      </CopyButton>
      <CopyStatus role="status">
        {status === "copied" && "粘贴到 Agent 对话中发送。"}
        {status === "failed" && "复制失败，请检查浏览器的剪贴板权限后重试。"}
      </CopyStatus>
    </CopyArea>
  );
}

function openingInstructions() {
  const url = new URL(skillPublicBasePath, window.location.origin).href;
  return [
    "请读取这个目录中的游戏说明，用我已登录的 Binance Agentic Wallet 开始 Dark Forest Punk。",
    url,
    "请先核对 BNB Smart Chain 钱包地址和 Binance Handle，和我确认开局。完成出生后告诉我这局的钱包存档目录。",
  ].join("\n");
}

function TokenPurchase({
  token,
  symbol,
  publicClient,
}: {
  token: Address;
  symbol: string;
  publicClient: PublicClient;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const amountInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [quote, setQuote] = useState<{ amount: bigint; estimate?: string }>();
  const amount = parsePurchaseAmount(input);

  useEffect(() => {
    if (open && dialog.current && !dialog.current.open) {
      dialog.current.showModal();
      amountInput.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open || amount === undefined) return;
    let stopped = false;
    const timer = window.setTimeout(() => {
      void quoteHomeTokenBuy(publicClient, token, amount)
        .then(({ out, decimals }) => {
          if (!stopped) {
            setQuote({
              amount,
              estimate: out > 0n ? formatWholeToken(out, decimals) : "0",
            });
          }
        })
        .catch(() => {
          if (!stopped) setQuote({ amount });
        });
    }, 350);
    return () => {
      window.clearTimeout(timer);
      stopped = true;
    };
  }, [amount, open, publicClient, token]);

  const currentQuote = quote?.amount === amount ? quote : undefined;
  let quoteText = "—";
  if (amount !== undefined) {
    quoteText = currentQuote ? "暂时无法报价" : "正在报价…";
    if (currentQuote?.estimate !== undefined) {
      quoteText = `约 ${currentQuote.estimate} ${symbol}`;
    }
  }

  return (
    <>
      <CopyArea>
        <CopyButton
          type="button"
          onClick={() => {
            setQuote(undefined);
            setOpen(true);
          }}
        >
          购买游戏代币
        </CopyButton>
      </CopyArea>
      {open && (
        <PurchaseDialog
          ref={dialog}
          aria-labelledby="token-purchase-title"
          onClose={() => setOpen(false)}
        >
          <PurchaseHeader>
            <h2 id="token-purchase-title">购买 {symbol}</h2>
            <ClosePurchase
              type="button"
              onClick={() => dialog.current?.close()}
            >
              关闭
            </ClosePurchase>
          </PurchaseHeader>
          <PurchaseField>
            <label htmlFor="token-purchase-amount">支付金额</label>
            <AmountField>
              <input
                id="token-purchase-amount"
                inputMode="decimal"
                placeholder="0.00"
                ref={amountInput}
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  if (parsePurchaseAmount(event.target.value) !== amount)
                    setQuote(undefined);
                }}
                aria-describedby="token-purchase-hint"
              />
              <span>BNB</span>
            </AmountField>
          </PurchaseField>
          <PurchaseEstimate aria-live="polite">
            <span>预计到账</span>
            <strong>{quoteText}</strong>
          </PurchaseEstimate>
          <Muted id="token-purchase-hint">
            {input && amount === undefined
              ? "请输入大于 0 的 BNB 金额，最多 18 位小数。"
              : "以 Agent 获取的最新报价为准，确认后再提交交易。"}
          </Muted>
          <CopyCommand
            key={amount?.toString()}
            label="复制购买指令"
            instruction={
              amount === undefined
                ? undefined
                : () => tokenPurchaseInstructions(token, amount)
            }
          />
        </PurchaseDialog>
      )}
    </>
  );
}

const gameplay = [
  {
    title: "探索与占领",
    description:
      "从出生星向外探索，派舰队占领新星球。占领后登记垃圾额度，星球才会恢复能量或生产资源。",
  },
  {
    title: "调度舰队",
    description:
      "点选出发星，在右侧分配能量、银和材料。拖到目标星球生成出兵单，再粘贴给 agent 执行。",
  },
  {
    title: "换分与领奖",
    description:
      "把银或材料运到自己已登记的时空裂隙，提取后增加分数和矿池质押。有待领奖励时，在「游戏信息」复制领取命令，交给 agent。",
  },
];

// Preview scene rendered with the in-game shaders and planet animations.
function GameMapPreview() {
  const [playAnimation, setPlayAnimation] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPlayAnimation(!motion.matches);
    update();
    motion.addEventListener("change", update);
    return () => motion.removeEventListener("change", update);
  }, []);

  return (
    <MapPreview>
      {playAnimation ? (
        <video
          aria-hidden="true"
          src="/lobby-game-map.mp4"
          poster="/lobby-game-map.webp"
          autoPlay
          muted
          loop
          playsInline
        />
      ) : (
        <img src="/lobby-game-map.webp" alt="" />
      )}
    </MapPreview>
  );
}

export function HomeLobby({
  card,
  assets,
  notice,
  importing,
  syncing = false,
  onImport,
  onChangeFolder,
}: {
  card?: FolderCard;
  assets: HomeAssets;
  notice?: string;
  importing: boolean;
  syncing?: boolean;
  onImport: () => void;
  onChangeFolder: () => void;
}) {
  const { match } = assets;
  const {
    network: { publicClient },
  } = useMUD();
  const chainId = publicClient.chain?.id ?? 56;
  const canImport = !syncing && !importing;
  let importLabel = "导入游戏数据";
  if (syncing) importLabel = "正在同步游戏数据";
  if (importing) importLabel = "正在读取游戏数据";

  return (
    <Page>
      <TopBar id="home-top">
        <TopBarInner>
          <Brand href="#home-top" aria-label="Dark Forest Punk 首页">
            <img
              src="/darkforest_punk_logo.png"
              alt=""
              width="34"
              height="34"
            />
            <span>Dark Forest Punk</span>
          </Brand>
          <Nav aria-label="首页导航">
            <NavLink href="#getting-started">如何开始</NavLink>
            <NavLink href="#how-to-play">怎么玩</NavLink>
            <NavLink href="#game-data">游戏数据</NavLink>
            <DocsLink to="/docs/overview">
              游戏文档 <span aria-hidden="true">↗</span>
            </DocsLink>
          </Nav>
        </TopBarInner>
      </TopBar>

      <Sheet>
        <Hero aria-labelledby="home-title">
          <HeroMain>
            <Genre>链上星际策略</Genre>
            <Title id="home-title">
              Dark Forest
              <strong>Punk</strong>
            </Title>
            <Lead>
              探索未知星域，从出生星扩张，向时空裂隙运送资源。你在星图上做决定，agent
              执行你交给它的游戏命令。
            </Lead>
            <HeroActions>
              <ImportButton
                type="button"
                disabled={!canImport}
                onClick={onImport}
              >
                {importLabel}
                {canImport && <span aria-hidden="true">→</span>}
              </ImportButton>
              <StartLink href="#getting-started">
                初次游玩 <span aria-hidden="true">↓</span>
              </StartLink>
            </HeroActions>
            {card && (
              <Folder>
                <FolderInfo>
                  <span>当前存档</span>
                  <strong title={card.folderName}>{card.folderName}</strong>
                </FolderInfo>
                <ChangeFolder
                  type="button"
                  disabled={!canImport}
                  onClick={onChangeFolder}
                >
                  更换文件夹
                </ChangeFolder>
              </Folder>
            )}
            {notice && <Notice role="status">{notice}</Notice>}
          </HeroMain>

          <GameMapPreview />
        </Hero>

        <Section id="getting-started" aria-labelledby="start-title">
          <SectionTitle id="start-title">如何开始</SectionTitle>
          <StartSteps>
            <StartStep>
              <h3>登录 Binance Agentic Wallet</h3>
              <p>让 Agent 发起登录，用 Binance App 核对配对码并确认。</p>
              <CopyArea>
                <TextDocsLink to="/docs/overview#wallet-login">
                  查看钱包登录步骤 ↗
                </TextDocsLink>
              </CopyArea>
            </StartStep>
            <StartStep>
              <h3>发送开局指令</h3>
              <p>
                把指令粘贴给 Agent，按提示质押 Game Pass NFT，完成注册和出生。
              </p>
              <CopyCommand
                label="复制开局指令"
                copiedLabel="已复制开局指令"
                instruction={openingInstructions}
              />
            </StartStep>
            <StartStep>
              <h3>导入这局的钱包目录</h3>
              <p>
                选择 Agent
                给出的钱包文件夹。进入星图后，可以跟着新手指引熟悉操作。
              </p>
              <CopyArea>
                <StepImportButton
                  type="button"
                  disabled={!canImport}
                  onClick={onImport}
                >
                  {importLabel}
                  {canImport && <span aria-hidden="true">→</span>}
                </StepImportButton>
              </CopyArea>
            </StartStep>
          </StartSteps>
        </Section>

        <Section id="how-to-play" aria-labelledby="play-title">
          <PlaySection>
            <div>
              <SectionTitle id="play-title">怎么玩</SectionTitle>
              <TextDocsLink to="/docs/overview">
                查看完整游戏规则 <span aria-hidden="true">↗</span>
              </TextDocsLink>
            </div>
            <GameplayList>
              {gameplay.map(({ title, description }) => (
                <GameplayEntry key={title}>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </GameplayEntry>
              ))}
            </GameplayList>
          </PlaySection>
        </Section>

        <Section id="game-data" aria-labelledby="data-title">
          <SectionTitle id="data-title">游戏数据</SectionTitle>
          <Metrics>
            <div>
              <dt>玩家数</dt>
              <dd>{whole(match?.players)}</dd>
            </div>
            <div>
              <dt>最高星球等级</dt>
              <dd>{whole(match?.maxPlanetLevel)}</dd>
            </div>
            <div>
              <dt>内圈收缩</dt>
              <dd>
                {match?.shrinkPct === undefined
                  ? "读取中"
                  : `${match.shrinkPct.toFixed(1)}%`}
              </dd>
            </div>
            <div>
              <dt>累计发放奖励</dt>
              <dd>
                {assets.totalRewards !== undefined ? (
                  <>
                    {assets.totalRewards} <small>{assets.tokenSymbol}</small>
                  </>
                ) : (
                  <small>
                    {assets.rewardsUnavailable ? "暂时无法读取" : "读取中"}
                  </small>
                )}
              </dd>
            </div>
          </Metrics>
          <DataPanels>
            <LeaderboardCard>
              <h3>排行榜</h3>
              <HomeLeaderboardPanel
                boards={assets.boards}
                handles={assets.handles}
                previewLimit={15}
                framed={false}
                showTitle={false}
              />
            </LeaderboardCard>
            <AssetPanels>
              <DataPanel>
                <h3>Nutbox 矿池</h3>
                {assets.poolNote && <Muted>{assets.poolNote}</Muted>}
                {assets.pools.map((pool) => (
                  <DataGroup key={pool.address}>
                    <GroupTitle>
                      {pool.label}
                      <AddressLink chainId={chainId} address={pool.address} />
                    </GroupTitle>
                    <Details>
                      <dt>质押数量</dt>
                      <dd>{pool.totalStaked}</dd>
                      <dt>每小时奖励</dt>
                      <dd>{pool.hourlyReward ?? "暂无数据"}</dd>
                    </Details>
                  </DataGroup>
                ))}
              </DataPanel>
              <DataPanel>
                <h3>游戏代币 · {assets.tokenSymbol}</h3>
                <Details>
                  <dt>合约</dt>
                  <dd>
                    {assets.tokenAddress ? (
                      <AddressLink
                        chainId={chainId}
                        address={assets.tokenAddress}
                      />
                    ) : (
                      "待配置"
                    )}
                  </dd>
                  <dt>已销毁</dt>
                  <dd>{assets.burnedAmount ?? "读取中"}</dd>
                  <dt>价格</dt>
                  <dd>{assets.tokenPrice ?? "读取中"}</dd>
                  <dt>FDV</dt>
                  <dd>{assets.tokenFdv ?? "读取中"}</dd>
                </Details>
                {chainId === 56 && assets.tokenAddress && (
                  <TokenPurchase
                    key={assets.tokenAddress}
                    token={assets.tokenAddress}
                    symbol={assets.tokenSymbol}
                    publicClient={publicClient}
                  />
                )}
              </DataPanel>
              <DataPanel>
                <h3>Game Pass NFT</h3>
                {assets.nfts.length === 0 && <Muted>暂无 NFT 发行数据。</Muted>}
                {assets.nfts.map((nft) => (
                  <DataGroup key={nft.address}>
                    <GroupTitle>
                      {nft.label}
                      <AddressLink chainId={chainId} address={nft.address} />
                    </GroupTitle>
                    <Details>
                      <dt>发行上限</dt>
                      <dd>{nft.maxSupply ?? "暂无数据"}</dd>
                      <dt>已发行</dt>
                      <dd>{nft.minted ?? "暂无数据"}</dd>
                      <dt>铸造 1 枚</dt>
                      <dd>{nft.mintPrice ?? "暂无报价"}</dd>
                    </Details>
                    {chainId === 56 && (
                      <CopyCommand
                        label={nft.soldOut ? "已售罄" : "复制 NFT 购买指令"}
                        instruction={
                          nft.soldOut
                            ? undefined
                            : () =>
                                nftPurchaseInstructions(
                                  window.location.origin,
                                  getNetworkConfig().worldAddress,
                                  nft.address,
                                  assets.tokenAddress,
                                )
                        }
                      />
                    )}
                  </DataGroup>
                ))}
              </DataPanel>
            </AssetPanels>
          </DataPanels>
        </Section>
      </Sheet>
    </Page>
  );
}

const Page = styled.main`
  --lobby-bg: #0a0e17;
  --lobby-panel: #101723;
  --lobby-line: #273345;
  --lobby-text: #eef3fc;
  --lobby-muted: #aab8cf;
  --lobby-accent: #7cede0;
  position: fixed;
  inset: 0;
  z-index: 8;
  overflow: auto;
  scroll-behavior: smooth;
  color: var(--lobby-text);
  background: var(--lobby-bg);

  &::before {
    position: fixed;
    z-index: -1;
    inset: 0;
    background:
      linear-gradient(180deg, rgb(10 14 23 / 18%), rgb(10 14 23 / 75%)),
      url("/lobby-starfield.webp") center top / cover no-repeat;
    pointer-events: none;
    content: "";
  }

  font-family: system-ui, "PingFang SC", "Microsoft YaHei", sans-serif;
  line-height: 1.6;

  & :focus-visible {
    outline: 2px solid var(--lobby-accent);
    outline-offset: 4px;
  }

  @media (prefers-reduced-motion: reduce) {
    scroll-behavior: auto;
  }
`;

const contentWidth = css`
  width: min(1184px, calc(100% - 64px));
  margin-inline: auto;

  @media (max-width: 600px) {
    width: calc(100% - 36px);
  }
`;

const TopBar = styled.header`
  border-bottom: 1px solid var(--lobby-line);
  background: rgb(10 14 23 / 70%);
`;

const TopBarInner = styled.div`
  ${contentWidth}
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 68px;
  gap: 12px 28px;

  @media (max-width: 640px) {
    flex-wrap: wrap;
    padding: 12px 0;
  }
`;

const Brand = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--lobby-text);
  font-size: 15px;
  font-weight: 750;
  white-space: nowrap;
  text-decoration: none;

  img {
    display: block;
  }
`;

const Nav = styled.nav`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px clamp(16px, 2.2vw, 32px);

  @media (max-width: 640px) {
    flex-basis: 100%;
    gap: 8px 18px;
  }
`;

const navLink = css`
  color: var(--lobby-muted);
  font-size: 13px;
  text-decoration: none;
  white-space: nowrap;

  &:hover {
    color: var(--lobby-accent);
  }
`;

const NavLink = styled.a`
  ${navLink}
`;
const DocsLink = styled(Link)`
  ${navLink}
  color: var(--lobby-accent);
`;

const Sheet = styled.div`
  ${contentWidth}
  padding-bottom: 72px;
`;

const Hero = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 0.94fr) minmax(0, 1.06fr);
  align-items: center;
  gap: clamp(24px, 5vw, 76px);
  padding: clamp(38px, 4.4vw, 62px) 0 clamp(40px, 4.1vw, 56px);

  @media (max-width: 780px) {
    grid-template-columns: minmax(0, 1fr);
    gap: 30px;
  }
`;

const HeroMain = styled.div`
  min-width: 0;
`;

const Genre = styled.p`
  margin: 0 0 14px;
  color: var(--lobby-accent);
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0.17em;
`;

const Title = styled.h1`
  margin: 0;
  color: var(--lobby-text);
  font-size: clamp(3.15rem, 6.4vw, 6.1rem);
  line-height: 0.95;
  font-weight: 850;
  letter-spacing: -0.06em;
  word-spacing: 0.07em;

  strong {
    display: block;
    color: var(--lobby-accent);
    font-weight: inherit;
  }
`;

const Lead = styled.p`
  max-width: 380px;
  margin: 24px 0 0;
  color: var(--lobby-muted);
  font-size: 15px;
  line-height: 1.85;
`;

const HeroActions = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px 20px;
  margin-top: 24px;
`;

const buttonBase = css`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  border: 1px solid transparent;
  border-radius: 5px;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  text-decoration: none;

  &:disabled {
    cursor: default;
    opacity: 0.65;
  }
`;

const ImportButton = styled.button`
  ${buttonBase}
  min-height: 46px;
  padding: 8px 15px;
  color: #09221d;
  background: var(--lobby-accent);

  &:hover:not(:disabled) {
    background: #a5f7f0;
  }
`;

const StepImportButton = styled(ImportButton)`
  min-height: 36px;
  padding: 4px 10px;
  font-size: 13px;
`;

const StartLink = styled.a`
  ${buttonBase}
  min-height: 44px;
  color: var(--lobby-text);

  &:hover {
    color: var(--lobby-accent);
  }
`;

const Folder = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px 14px;
  max-width: 416px;
  margin-top: 16px;
  padding: 8px 10px;
  border: 1px solid var(--lobby-line);
  border-radius: 5px;
  background: var(--lobby-panel);
`;

const FolderInfo = styled.div`
  min-width: 0;
  font-size: 12px;
  overflow-wrap: anywhere;

  span {
    display: block;
    color: var(--lobby-muted);
  }

  strong {
    font-weight: 600;
  }
`;

const ChangeFolder = styled.button`
  padding: 5px 0;
  flex: none;
  color: var(--lobby-accent);
  border: 0;
  background: transparent;
  font: inherit;
  font-size: 12px;
  cursor: pointer;

  &:hover:not(:disabled) {
    text-decoration: underline;
  }
`;

const Notice = styled.p`
  max-width: 440px;
  margin: 16px 0 0;
  padding: 8px 12px;
  border-left: 2px solid #f1a7bd;
  color: #ffc1d4;
  background: #241826;
  font-size: 13px;
`;

const MapPreview = styled.figure`
  position: relative;
  isolation: isolate;
  aspect-ratio: 1.36;
  margin: 0;
  overflow: hidden;
  border: 1px solid #485879;
  border-radius: 7px;
  background: #0b061f;
  box-shadow: 0 22px 48px rgb(3 6 13 / 45%);

  video,
  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  &::after {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, transparent 74%, rgb(7 9 24 / 85%));
    pointer-events: none;
    content: "";
  }

  figcaption {
    position: absolute;
    z-index: 1;
    bottom: 14px;
    left: 16px;
    font-size: 12px;
    letter-spacing: 0.08em;
  }

  @media (max-width: 780px) {
    aspect-ratio: 2.05;
  }
`;

const Section = styled.section`
  scroll-margin-top: 18px;
  border-top: 1px solid var(--lobby-line);
  padding: 28px 0 38px;
`;

const SectionTitle = styled.h2`
  margin: 0 0 18px;
  font-size: clamp(24px, 3vw, 33px);
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.035em;
`;

const StartSteps = styled.ol`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 0;
  padding: 0;
  list-style: none;
  counter-reset: start-step;
  overflow: hidden;
  border: 1px solid var(--lobby-line);
  border-radius: 6px;
  background: var(--lobby-panel);

  @media (max-width: 720px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const StartStep = styled.li`
  counter-increment: start-step;
  padding: 19px 20px 16px;

  & + & {
    border-left: 1px solid var(--lobby-line);
  }

  &::before {
    display: block;
    margin-bottom: 8px;
    color: var(--lobby-accent);
    font:
      600 13px/1 ui-monospace,
      monospace;
    content: counter(start-step, decimal-leading-zero);
  }

  h3 {
    margin: 0 0 5px;
    font-size: 16px;
    font-weight: 650;
  }

  p {
    margin: 0;
    color: var(--lobby-muted);
    font-size: 13px;
    line-height: 1.75;
  }

  @media (max-width: 720px) {
    & + & {
      border-left: 0;
      border-top: 1px solid var(--lobby-line);
    }
  }
`;

const CopyArea = styled.div`
  margin-top: 12px;
`;

const CopyButton = styled.button`
  ${buttonBase}
  min-height: 36px;
  padding: 4px 10px;
  border-color: #467775;
  color: var(--lobby-accent);
  background: #16282e;
  font-size: 13px;

  &:hover:not(:disabled) {
    border-color: var(--lobby-accent);
    background: #1c3840;
  }
`;

const CopyStatus = styled.p`
  && {
    margin-top: 6px;
    font-size: 12px;
  }

  &:empty {
    display: none;
  }
`;

const PlaySection = styled.div`
  display: grid;
  grid-template-columns: minmax(150px, 0.65fr) minmax(0, 2fr);
  gap: 16px 42px;

  @media (max-width: 720px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const TextDocsLink = styled(Link)`
  ${navLink}
  color: var(--lobby-accent);
`;

const GameplayList = styled.div`
  min-width: 0;
`;

const GameplayEntry = styled.div`
  display: grid;
  grid-template-columns: minmax(130px, 0.52fr) minmax(0, 2fr);
  gap: 4px 18px;
  padding: 12px 0;

  &:first-child {
    padding-top: 0;
  }

  & + & {
    border-top: 1px solid var(--lobby-line);
  }

  h3,
  p {
    margin: 0;
  }

  h3 {
    font-size: 15px;
    font-weight: 650;
  }

  p {
    color: var(--lobby-muted);
    font-size: 14px;
  }

  @media (max-width: 520px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const Metrics = styled.dl`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr)) minmax(0, 1.4fr);
  margin: 0 0 16px;
  border: 1px solid var(--lobby-line);
  border-radius: 8px;
  background: var(--lobby-panel);

  div {
    min-width: 0;
    padding: 14px clamp(10px, 2.2vw, 24px);
  }

  div + div {
    border-left: 1px solid var(--lobby-line);
  }

  div:last-child {
    background: rgb(124 237 224 / 5%);
  }

  dt {
    color: var(--lobby-muted);
    font-size: 12px;
  }

  dd {
    margin: 2px 0 0;
    font-size: clamp(17px, 2.15vw, 26px);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }

  dd small {
    color: var(--lobby-accent);
    font-size: 13px;
    font-weight: 600;
  }

  @media (max-width: 690px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));

    div:nth-child(3) {
      border-left: 0;
    }

    div:nth-child(n + 3) {
      border-top: 1px solid var(--lobby-line);
    }
  }
`;

const DataPanels = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr);
  align-items: stretch;
  gap: 16px;

  @media (max-width: 720px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const AssetPanels = styled.div`
  min-width: 0;
  display: grid;
  gap: 12px;
`;

const DataPanel = styled.section`
  min-width: 0;
  padding: 14px 16px;
  border: 1px solid var(--lobby-line);
  border-radius: 6px;
  background: var(--lobby-panel);

  h3 {
    margin: 0 0 10px;
    font-size: 16px;
    font-weight: 650;
  }
`;

const LeaderboardCard = styled(DataPanel)`
  display: flex;
  flex-direction: column;
  min-height: 0;

  @media (min-width: 721px) {
    contain: size;
  }

  @media (max-width: 720px) {
    min-height: 200px;
  }
`;

const DataGroup = styled.div`
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--lobby-line);
`;

const GroupTitle = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 2px 14px;
  font-size: 13px;
  font-weight: 650;
`;

const Details = styled.dl`
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 4px 12px;
  margin: 5px 0 0;
  font-size: 13px;

  dt {
    color: var(--lobby-muted);
  }

  dd {
    margin: 0;
    text-align: right;
    overflow-wrap: anywhere;
  }
`;

const Muted = styled.p`
  margin: 0;
  color: var(--lobby-muted);
  font-size: 13px;
`;

const PurchaseDialog = styled.dialog`
  position: fixed;
  inset: 0;
  width: min(420px, calc(100% - 32px));
  max-height: calc(100% - 32px);
  margin: auto;
  padding: 22px;
  overflow: auto;
  border: 1px solid #466070;
  border-radius: 10px;
  color: var(--lobby-text);
  background: var(--lobby-panel);
  font: inherit;

  &::backdrop {
    background: rgb(3 7 13 / 75%);
  }
`;

const PurchaseHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;

  h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
  }
`;

const ClosePurchase = styled.button`
  ${buttonBase}
  min-height: 32px;
  padding: 0 8px;
  color: var(--lobby-muted);

  &:hover {
    color: var(--lobby-text);
  }
`;

const PurchaseField = styled.div`
  margin-bottom: 14px;
  font-size: 14px;

  label {
    color: var(--lobby-muted);
  }
`;

const AmountField = styled.div`
  display: flex;
  align-items: center;
  margin-top: 6px;
  border: 1px solid var(--lobby-line);
  border-radius: 6px;
  background: var(--lobby-bg);

  input {
    width: 100%;
    min-width: 0;
    padding: 9px 12px;
    background: transparent;
    color: var(--lobby-text);
  }

  span {
    margin-inline: 12px;
    color: var(--lobby-muted);
  }
`;

const PurchaseEstimate = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  margin: 8px 0;
  color: var(--lobby-muted);
  font-size: 14px;

  strong {
    min-width: 0;
    color: var(--lobby-accent);
    text-align: right;
    overflow-wrap: anywhere;
  }
`;

const AddrLink = styled.a`
  color: var(--lobby-accent);
  font:
    12px/1.65 ui-monospace,
    monospace;
  white-space: nowrap;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;
