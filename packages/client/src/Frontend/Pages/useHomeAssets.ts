import { useComponentValue } from "@latticexyz/react";
import { singletonEntity } from "@latticexyz/store-sync/recs";
import { useMUD } from "@mud/MUDContext";
import { useEffect, useState } from "react";
import { formatWholeToken } from "@df/gamelogic";
import {
  type Address,
  isAddress,
  parseAbi,
  type PublicClient,
  zeroAddress,
} from "viem";

const DEAD: Address = "0x000000000000000000000000000000000000dEaD";

/** Multicall3 on BSC / most EVM chains. */
const MULTICALL3: Address = "0xcA11bde05977b3631167028862bE2a173976CA11";

const communityAbi = parseAbi([
  "function rewardCalculator() view returns (address)",
]);

const calculatorAbi = parseAbi([
  "function getCurrentRewardRate(address community) view returns (uint256)",
]);

const poolAbi = parseAbi([
  "function getTotalStakedAmount() view returns (uint256)",
]);

const erc20Abi = parseAbi([
  "function symbol() view returns (string)",
  "function balanceOf(address account) view returns (uint256)",
]);

const nftAbi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function maxSupply() view returns (uint256)",
]);

const lockerAbi = parseAbi(["function nft() view returns (address)"]);

export type PoolRow = {
  address: string;
  label: string;
  totalStaked: string;
  hourlyReward?: string;
};

export type NftRow = {
  label: string;
  symbol?: string;
  address?: string;
  minted?: string;
  maxSupply?: string;
};

export type HomeAssets = {
  pools: PoolRow[];
  poolNote: string;
  tokenSymbol: string;
  tokenAddress?: string;
  /** 买银累计销毁（dead 地址余额），展示用。 */
  burnedAmount?: string;
  /** TagAI / 行情价文案。 */
  tokenPrice?: string;
  /** 完全稀释市值（FDV）文案。 */
  tokenFdv?: string;
  nfts: NftRow[];
};

const EMPTY: HomeAssets = {
  pools: [],
  poolNote: "正在读取矿池",
  tokenSymbol: "AIPRO",
  nfts: [],
};

function configured(value: string | undefined): Address | undefined {
  if (!value || !isAddress(value) || value.toLowerCase() === zeroAddress) {
    return undefined;
  }
  return value;
}

function grouped(value: bigint): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return "未接入";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.0001) return `$${n.toFixed(4)}`;
  return `$${n.toExponential(2)}`;
}

function formatPriceUsd(n: number): string {
  if (!Number.isFinite(n)) return "价格未接入";
  if (n >= 1) return `$${n.toFixed(4)}`;
  if (n >= 0.0001) return `$${n.toFixed(6)}`;
  return `$${n.toExponential(2)}`;
}

type TagAiQuote = { price?: string; fdv?: string };

/** Binance Web3 公开行情：价格 + FDV（USD）。 */
async function fetchTagAiQuote(token: Address): Promise<TagAiQuote> {
  try {
    const url =
      "https://web3.binance.com/bapi/defi/v4/public/wallet-direct/buw/wallet/market/token/dynamic/info/ai" +
      `?chainId=56&contractAddress=${token}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "binance-web3/1.1",
        "Accept-Encoding": "identity",
      },
    });
    if (!response.ok) return {};
    const body = (await response.json()) as {
      data?: { price?: string; fdv?: string };
    };
    const priceRaw = body.data?.price;
    const fdvRaw = body.data?.fdv;
    const priceN = priceRaw !== undefined ? Number(priceRaw) : NaN;
    const fdvN = fdvRaw !== undefined ? Number(fdvRaw) : NaN;
    return {
      price: Number.isFinite(priceN) ? formatPriceUsd(priceN) : undefined,
      fdv: Number.isFinite(fdvN) ? formatUsd(fdvN) : undefined,
    };
  } catch {
    return {};
  }
}

type CallResult = {
  status: "success" | "failure";
  result?: unknown;
};

function ok<T>(row: CallResult | undefined): T | undefined {
  if (!row || row.status !== "success") return undefined;
  return row.result as T;
}

/**
 * 首页链上读数：两轮 Multicall3，减少 RPC round-trip。
 * 第一轮：池质押 / 代币 / locker.nft / community.calculator
 * 第二轮：小时奖励 / NFT 元数据（依赖第一轮地址）
 */
async function loadHomeAssets(
  publicClient: PublicClient,
  scorePool: Address | undefined,
  paymentToken: Address | undefined,
  community: Address | undefined,
  passAddress: Address | undefined,
): Promise<HomeAssets> {
  const next: HomeAssets = {
    pools: [],
    poolNote: scorePool ? "DFXStar 分数池" : "分数池还没接到这局里",
    tokenSymbol: "AIPRO",
    tokenAddress: paymentToken,
    nfts: [],
  };

  // —— 第一轮：彼此独立的 view ——
  type Slot = "stake" | "symbol" | "burn" | "lockerNft" | "calculator";
  const round1: {
    slot: Slot;
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
  }[] = [];

  if (scorePool) {
    round1.push({
      slot: "stake",
      address: scorePool,
      abi: poolAbi,
      functionName: "getTotalStakedAmount",
    });
  }
  if (paymentToken) {
    round1.push({
      slot: "symbol",
      address: paymentToken,
      abi: erc20Abi,
      functionName: "symbol",
    });
    round1.push({
      slot: "burn",
      address: paymentToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [DEAD],
    });
  }
  if (passAddress) {
    round1.push({
      slot: "lockerNft",
      address: passAddress,
      abi: lockerAbi,
      functionName: "nft",
    });
  }
  if (community) {
    round1.push({
      slot: "calculator",
      address: community,
      abi: communityAbi,
      functionName: "rewardCalculator",
    });
  }

  const bySlot = new Map<Slot, CallResult>();
  if (round1.length > 0) {
    const results = (await publicClient.multicall({
      allowFailure: true,
      multicallAddress: MULTICALL3,
      contracts: round1.map((c) => ({
        address: c.address,
        abi: c.abi,
        functionName: c.functionName,
        args: c.args,
      })),
    })) as CallResult[];
    round1.forEach((c, i) => {
      bySlot.set(c.slot, results[i]);
    });
  }

  const stake = ok<bigint>(bySlot.get("stake"));
  const symbol = ok<string>(bySlot.get("symbol"));
  const burn = ok<bigint>(bySlot.get("burn"));
  const passNft = configured(ok<Address>(bySlot.get("lockerNft")));
  const calculator = configured(ok<Address>(bySlot.get("calculator")));

  if (scorePool) {
    const row: PoolRow = {
      address: scorePool,
      label: "DFXStar 分数池",
      totalStaked: stake !== undefined ? grouped(stake) : "读不到",
    };
    next.pools = [row];
    next.poolNote = "";
  }

  if (symbol) next.tokenSymbol = symbol;
  if (burn !== undefined) next.burnedAmount = formatWholeToken(burn);

  // 行情与第二轮链上读并行
  const quotePromise: Promise<TagAiQuote> = paymentToken
    ? fetchTagAiQuote(paymentToken)
    : Promise.resolve({});

  // —— 第二轮：依赖第一轮地址 ——
  type Slot2 = "rate" | "nftName" | "nftSymbol" | "nftMinted" | "nftMax";
  const round2: {
    slot: Slot2;
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
  }[] = [];

  if (calculator && community) {
    round2.push({
      slot: "rate",
      address: calculator,
      abi: calculatorAbi,
      functionName: "getCurrentRewardRate",
      args: [community],
    });
  }
  if (passNft) {
    round2.push({
      slot: "nftName",
      address: passNft,
      abi: nftAbi,
      functionName: "name",
    });
    round2.push({
      slot: "nftSymbol",
      address: passNft,
      abi: nftAbi,
      functionName: "symbol",
    });
    round2.push({
      slot: "nftMinted",
      address: passNft,
      abi: nftAbi,
      functionName: "totalSupply",
    });
    round2.push({
      slot: "nftMax",
      address: passNft,
      abi: nftAbi,
      functionName: "maxSupply",
    });
  }

  const bySlot2 = new Map<Slot2, CallResult>();
  const round2Promise =
    round2.length > 0
      ? publicClient.multicall({
          allowFailure: true,
          multicallAddress: MULTICALL3,
          contracts: round2.map((c) => ({
            address: c.address,
            abi: c.abi,
            functionName: c.functionName,
            args: c.args,
          })),
        })
      : Promise.resolve([] as CallResult[]);

  const [quote, round2Results] = await Promise.all([
    quotePromise,
    round2Promise as Promise<CallResult[]>,
  ]);

  next.tokenPrice = quote.price ?? (paymentToken ? "价格未接入" : undefined);
  next.tokenFdv = quote.fdv ?? (paymentToken ? "未接入" : undefined);

  round2.forEach((c, i) => {
    bySlot2.set(c.slot, round2Results[i]);
  });

  const rate = ok<bigint>(bySlot2.get("rate"));
  if (rate !== undefined && next.pools[0]) {
    next.pools[0].hourlyReward = `${formatWholeToken(rate)} / 小时`;
  }

  if (passNft) {
    const name = ok<string>(bySlot2.get("nftName"));
    const nftSymbol = ok<string>(bySlot2.get("nftSymbol"));
    const minted = ok<bigint>(bySlot2.get("nftMinted"));
    const maxSupply = ok<bigint>(bySlot2.get("nftMax"));
    next.nfts.push({
      label: name ?? "Game Pass NFT",
      address: passNft,
      symbol: nftSymbol,
      minted: minted !== undefined ? grouped(minted) : undefined,
      maxSupply: maxSupply !== undefined ? grouped(maxSupply) : undefined,
    });
  }

  return next;
}

/** 首页：只展示 DFXStar 分数池、代币销毁 / 价格 / FDV、入场 NFT 发行量。 */
export function useHomeAssets(_wallet: string | undefined): HomeAssets {
  const {
    network: { publicClient },
    components: { DFXStarConfig, GamePassNFT },
  } = useMUD();
  const star = useComponentValue(DFXStarConfig, singletonEntity);
  const pass = useComponentValue(GamePassNFT, singletonEntity);
  const [assets, setAssets] = useState<HomeAssets>(EMPTY);

  useEffect(() => {
    let stopped = false;
    const scorePool = configured(star?.scoreStakingPool);
    const paymentToken = configured(star?.paymentToken);
    const community = configured(star?.community);
    const passAddress = configured(pass?.addr);

    loadHomeAssets(
      publicClient,
      scorePool,
      paymentToken,
      community,
      passAddress,
    )
      .then((next) => {
        if (!stopped) setAssets(next);
      })
      .catch(() => {
        if (!stopped) {
          setAssets({
            ...EMPTY,
            poolNote: "链上暂时读不到",
          });
        }
      });

    return () => {
      stopped = true;
    };
  }, [
    pass?.addr,
    publicClient,
    star?.community,
    star?.paymentToken,
    star?.scoreStakingPool,
  ]);

  return assets;
}
