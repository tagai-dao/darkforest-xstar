import { formatWholeToken } from "@df/gamelogic";
import { resourceToHex } from "@latticexyz/common";
import { getNetworkConfig } from "@mud/getNetworkConfig";
import { useMUD } from "@mud/MUDContext";
import { useEffect, useState } from "react";
import {
  type Abi,
  type Address,
  formatUnits,
  getAddress,
  type Hex,
  isAddress,
  parseAbi,
  parseAbiItem,
  type PublicClient,
  sliceHex,
  zeroAddress,
} from "viem";

import { fetchHomeBoards, type HomeBoards } from "./homeLeaderboard";

const DEAD: Address = "0x000000000000000000000000000000000000dEaD";

const worldAbi = parseAbi([
  "function getRecord(bytes32 tableId, bytes32[] keyTuple) view returns (bytes, bytes32, bytes)",
]);
const WORLD_TABLES = {
  config: "DFXStarConfig",
  pass: "GamePassNFT",
  circle: "InnerCircle",
  frontier: "SilverFrontier",
  stats: "GlobalStats",
} as const;
const INITIAL_INNER_RADIUS = 75_000;

const communityAbi = parseAbi([
  "function rewardCalculator() view returns (address)",
  "function getCommunityToken() view returns (address)",
]);

const calculatorAbi = parseAbi([
  "function getCurrentRewardRate(address community) view returns (uint256)",
  "function calculateReward(address community, uint256 start, uint256 end) view returns (uint256)",
]);

const poolAbi = parseAbi([
  "function getTotalStakedAmount() view returns (uint256)",
  "function getCommunity() view returns (address)",
]);

const erc20Abi = parseAbi([
  "function symbol() view returns (string)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

const nftAbi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function maxSupply() view returns (uint256)",
  "function communityTokenPrice() view returns (uint256)",
  "function nativePrice() view returns (uint256)",
]);

const lockerAbi = parseAbi([
  "function nft() view returns (address)",
  "function handleRegistry() view returns (address)",
]);
const registryAbi = parseAbi([
  "function handleOf(address owner) view returns (string)",
]);
const injectedEvent = parseAbiItem(
  "event InjectedRewards(address indexed injector, uint256 amount, uint256 totalStaked)",
);
const LOG_BLOCK_SPAN = 10_000n;
const LOG_CONCURRENCY = 4;

export type PoolRow = {
  address: string;
  label: string;
  totalStaked: string;
  hourlyReward?: string;
};

export type NftRow = {
  label: string;
  symbol?: string;
  address: Address;
  mintPrice?: string;
  soldOut: boolean;
  minted?: string;
  maxSupply?: string;
};

export type HomeAssets = {
  pools: PoolRow[];
  poolNote: string;
  tokenSymbol: string;
  tokenAddress?: Address;
  /** 买银累计销毁（dead 地址余额），展示用。 */
  burnedAmount?: string;
  /** TagAI / 行情价文案。 */
  tokenPrice?: string;
  /** 完全稀释市值（FDV）文案。 */
  tokenFdv?: string;
  nfts: NftRow[];
  totalRewards?: string;
  rewardsUnavailable?: boolean;
  match?: { players?: number; maxPlanetLevel?: number; shrinkPct?: number };
  boards?: HomeBoards;
  handles?: ReadonlyMap<string, string>;
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

function grouped(value: bigint | string): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * 矿池质押与 PlayerScore 一样是「展示 × 1000」的链上单位。
 * 不要用 formatWholeToken（默认 18 位），94899 分会显示成 0。
 */
function formatScoreStake(raw: bigint): string {
  return grouped(raw / 1000n);
}

/** 首页矿池等读数的刷新间隔。 */
const HOME_ASSETS_POLL_MS = 30_000;

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

type AssetRead = {
  slot: string;
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
};

async function readAssetStage(
  publicClient: PublicClient,
  blockNumber: bigint,
  reads: AssetRead[],
) {
  if (!reads.length) return new Map<string, unknown>();
  const multicall = publicClient.chain?.contracts?.multicall3;
  if (!multicall || BigInt(multicall.blockCreated ?? 0) > blockNumber) {
    throw new Error("Multicall3 is unavailable for the current chain snapshot");
  }
  const results = await publicClient.multicall({
    blockNumber,
    multicallAddress: multicall.address,
    allowFailure: true,
    batchSize: 8192,
    contracts: reads.map(({ address, abi, functionName, args }) => ({
      address,
      abi,
      functionName,
      args,
    })),
  });
  return new Map(
    reads.map(({ slot }, index) => {
      const result = results[index];
      return [slot, result?.status === "success" ? result.result : undefined];
    }),
  );
}

type GameRewardHistory = {
  blockNumber: bigint;
  total: bigint;
};

// BSC round 1: sum of InjectedRewards from deployment through finalized block
// 135779388 (0x387e1445a8f4c58c44826e6ac9abfa6ee79d0c11d8f6005f555dc9d64118af7a).
const ROUND_ONE_REWARDS = {
  world: "0xfad1cddad97113e4c0335ff5a815955c21b2ddca",
  pool: "0x375ded0c49aeb8ddd3e9db6a4b5c84a0add93c9f",
  startBlock: 135405573n,
  blockNumber: 135779388n,
  total: 7031500000000000000000n,
} as const;

export function readGameInjections(
  startBlock: bigint | undefined,
  world?: string,
) {
  const histories = new Map<Address, GameRewardHistory>();
  return async (client: PublicClient, pool: Address, blockNumber: bigint) => {
    if (startBlock === undefined) throw new Error("Missing World start block");
    const checkpoint = ROUND_ONE_REWARDS;
    const matchesCheckpoint =
      client.chain?.id === 56 &&
      startBlock === checkpoint.startBlock &&
      world?.toLowerCase() === checkpoint.world &&
      pool.toLowerCase() === checkpoint.pool;
    const history =
      histories.get(pool) ?? (matchesCheckpoint ? checkpoint : undefined);
    const cached =
      history && history.blockNumber <= blockNumber ? history : undefined;
    let total = cached?.total ?? 0n;
    let fromBlock = cached ? cached.blockNumber + 1n : startBlock;
    while (fromBlock <= blockNumber) {
      const windows = [];
      for (
        let index = 0;
        index < LOG_CONCURRENCY && fromBlock <= blockNumber;
        index++
      ) {
        const end = fromBlock + LOG_BLOCK_SPAN - 1n;
        windows.push({
          fromBlock,
          toBlock: end < blockNumber ? end : blockNumber,
        });
        fromBlock = end + 1n;
      }
      const results = await Promise.all(
        windows.map((window) =>
          client.getLogs({
            address: pool,
            event: injectedEvent,
            strict: true,
            ...window,
          }),
        ),
      );
      for (const logs of results) {
        for (const log of logs) total += log.args.amount;
      }
    }
    // The snapshot is finalized, so subsequent refreshes can reuse these logs.
    if (!history || history.blockNumber < blockNumber)
      histories.set(pool, { blockNumber, total });
    return total;
  };
}

function packedAddress(data: Hex, offset: number) {
  if (data.length < (offset + 20) * 2 + 2) return undefined;
  return configured(getAddress(sliceHex(data, offset, offset + 20)));
}

function packedNumber(data: Hex | undefined, offset: number, size: number) {
  if (!data || data.length < (offset + size) * 2 + 2) return undefined;
  return Number(BigInt(sliceHex(data, offset, offset + size)));
}

export async function loadHomeAssets(
  publicClient: PublicClient,
  worldAddress: Address,
  gameInjections: ReturnType<typeof readGameInjections>,
  boardPromise?: Promise<HomeBoards>,
  onMetadata?: (assets: HomeAssets) => void,
): Promise<HomeAssets> {
  const { number: blockNumber, timestamp } = await publicClient.getBlock({
    blockTag: "finalized",
  });
  const records = await readAssetStage(
    publicClient,
    blockNumber,
    Object.entries(WORLD_TABLES).map(([slot, name]) => ({
      slot,
      address: worldAddress,
      abi: worldAbi,
      functionName: "getRecord",
      args: [resourceToHex({ type: "table", namespace: "df", name }), []],
    })),
  );
  const staticRecord = (slot: keyof typeof WORLD_TABLES) =>
    (records.get(slot) as [Hex, Hex, Hex] | undefined)?.[0];
  const config = staticRecord("config");
  const pass = staticRecord("pass");
  if (config === undefined || pass === undefined)
    throw new Error("World asset configuration could not be read");

  const scorePool = packedAddress(config, 0);
  const paymentToken = packedAddress(config, 20);
  const community = packedAddress(config, 60);
  const passAddress = packedAddress(pass, 0);
  const radius = packedNumber(staticRecord("circle"), 0, 8);
  const match = {
    players: packedNumber(staticRecord("stats"), 32, 32),
    maxPlanetLevel: packedNumber(staticRecord("frontier"), 0, 1),
    shrinkPct:
      radius === undefined
        ? undefined
        : Math.min(100, Math.max(0, (1 - radius / INITIAL_INNER_RADIUS) * 100)),
  };
  const next: HomeAssets = {
    pools: [],
    poolNote: scorePool ? "" : "分数池还没接到这局里",
    tokenSymbol: "AIPRO",
    tokenAddress: paymentToken,
    match,
    nfts: [],
  };

  const quotePromise: Promise<TagAiQuote> =
    paymentToken && publicClient.chain?.id === 56
      ? fetchTagAiQuote(paymentToken)
      : Promise.resolve({});

  const round1: AssetRead[] = [];
  if (scorePool) {
    round1.push(
      {
        slot: "stake",
        address: scorePool,
        abi: poolAbi,
        functionName: "getTotalStakedAmount",
      },
      {
        slot: "poolCommunity",
        address: scorePool,
        abi: poolAbi,
        functionName: "getCommunity",
      },
    );
  }
  if (paymentToken) {
    round1.push(
      {
        slot: "symbol",
        address: paymentToken,
        abi: erc20Abi,
        functionName: "symbol",
      },
      {
        slot: "burn",
        address: paymentToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [DEAD],
      },
      {
        slot: "decimals",
        address: paymentToken,
        abi: erc20Abi,
        functionName: "decimals",
      },
    );
  }
  if (passAddress) {
    round1.push({
      slot: "lockerNft",
      address: passAddress,
      abi: lockerAbi,
      functionName: "nft",
    });
    if (boardPromise) {
      round1.push({
        slot: "registry",
        address: passAddress,
        abi: lockerAbi,
        functionName: "handleRegistry",
      });
    }
  }
  if (community) {
    round1.push(
      {
        slot: "calculator",
        address: community,
        abi: communityAbi,
        functionName: "rewardCalculator",
      },
      {
        slot: "rewardToken",
        address: community,
        abi: communityAbi,
        functionName: "getCommunityToken",
      },
    );
  }

  const first = await readAssetStage(publicClient, blockNumber, round1);
  const stake = first.get("stake") as bigint | undefined;
  const symbol = first.get("symbol") as string | undefined;
  const burn = first.get("burn") as bigint | undefined;
  const decimals = first.get("decimals") as number | undefined;
  const poolCommunity = configured(
    first.get("poolCommunity") as Address | undefined,
  );
  const rewardToken = configured(
    first.get("rewardToken") as Address | undefined,
  );
  const passNft = configured(first.get("lockerNft") as Address | undefined);
  const calculator = configured(first.get("calculator") as Address | undefined);
  const gameRewards =
    scorePool &&
    community &&
    poolCommunity?.toLowerCase() === community.toLowerCase() &&
    paymentToken &&
    rewardToken?.toLowerCase() === paymentToken.toLowerCase()
      ? gameInjections(publicClient, scorePool, blockNumber).catch(
          () => undefined,
        )
      : undefined;

  if (scorePool) {
    next.pools = [
      {
        address: scorePool,
        label: "DFXStar 分数池",
        totalStaked: stake !== undefined ? formatScoreStake(stake) : "读不到",
      },
    ];
  }
  if (symbol) next.tokenSymbol = symbol;
  if (burn !== undefined && decimals !== undefined) {
    next.burnedAmount = formatWholeToken(burn, decimals);
  }

  const round2: AssetRead[] = [];
  if (calculator && community) {
    round2.push({
      slot: "rate",
      address: calculator,
      abi: calculatorAbi,
      functionName: "getCurrentRewardRate",
      args: [community],
    });
    if (gameRewards) {
      // HourlyTickCalculator measures releases from its injection history.
      // Calculate up to the current hour of this same finalized block.
      const rewardHead = timestamp - (timestamp % 3600n);
      round2.push({
        slot: "released",
        address: calculator,
        abi: calculatorAbi,
        functionName: "calculateReward",
        args: [community, 0n, rewardHead],
      });
    }
  }
  if (passNft) {
    for (const functionName of [
      "name",
      "symbol",
      "totalSupply",
      "maxSupply",
      "communityTokenPrice",
      "nativePrice",
    ]) {
      round2.push({
        slot: functionName,
        address: passNft,
        abi: nftAbi,
        functionName,
      });
    }
  }

  const boards = await boardPromise;
  const registry = configured(first.get("registry") as Address | undefined);
  const boardAddresses = new Set(
    [...(boards?.score ?? []), ...(boards?.kills ?? [])]
      .map(({ address }) => address.toLowerCase())
      .filter((address): address is Address => isAddress(address)),
  );
  if (registry) {
    for (const address of boardAddresses) {
      round2.push({
        slot: address,
        address: registry,
        abi: registryAbi,
        functionName: "handleOf",
        args: [address],
      });
    }
  }

  const second = await readAssetStage(publicClient, blockNumber, round2);
  const rate = second.get("rate") as bigint | undefined;
  if (rate !== undefined && decimals !== undefined && next.pools[0]) {
    next.pools[0].hourlyReward = `${formatWholeToken(rate, decimals)} / 小时`;
  }
  if (passNft) {
    const minted = second.get("totalSupply") as bigint | undefined;
    const maxSupply = second.get("maxSupply") as bigint | undefined;
    const tokenPrice = second.get("communityTokenPrice") as bigint | undefined;
    const nativePrice = second.get("nativePrice") as bigint | undefined;
    const native = publicClient.chain?.nativeCurrency;
    const mintPrice =
      tokenPrice === undefined ||
      nativePrice === undefined ||
      decimals === undefined ||
      !native
        ? undefined
        : `${formatUnits(tokenPrice, decimals).replace(/^\d+/, grouped)} ${next.tokenSymbol} + ${formatUnits(nativePrice, native.decimals)} ${native.symbol}`;

    next.nfts.push({
      label: (second.get("name") as string | undefined) ?? "Game Pass NFT",
      symbol: second.get("symbol") as string | undefined,
      address: passNft,
      minted: minted !== undefined ? grouped(minted) : undefined,
      maxSupply: maxSupply !== undefined ? grouped(maxSupply) : undefined,
      soldOut:
        minted !== undefined &&
        maxSupply !== undefined &&
        maxSupply > 0n &&
        minted >= maxSupply,
      mintPrice,
    });
  }

  const handles = new Map<string, string>();
  for (const address of boardAddresses) {
    const handle = second.get(address);
    if (typeof handle === "string" && handle) handles.set(address, handle);
  }
  next.boards = boards;
  next.handles = handles;

  const quote = await quotePromise;
  next.tokenPrice = quote.price ?? (paymentToken ? "价格未接入" : undefined);
  next.tokenFdv = quote.fdv ?? (paymentToken ? "未接入" : undefined);
  onMetadata?.({ ...next });

  const released = second.get("released") as bigint | undefined;
  const injected = await gameRewards;
  if (
    decimals !== undefined &&
    released !== undefined &&
    injected !== undefined
  ) {
    next.totalRewards = formatWholeToken(released + injected, decimals);
  } else {
    next.rewardsUnavailable = true;
  }
  return next;
}

export function useHomeAssets(enabled: boolean): HomeAssets {
  const {
    network: { publicClient },
  } = useMUD();
  const { worldAddress, initialBlockNumber } = getNetworkConfig();
  const [assets, setAssets] = useState<HomeAssets>(EMPTY);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let inFlight = false;
    const gameInjections = readGameInjections(
      initialBlockNumber >= 0 ? BigInt(initialBlockNumber) : undefined,
      worldAddress,
    );

    const boardPromise = fetchHomeBoards();

    const refresh = () => {
      if (inFlight) return;
      inFlight = true;
      void loadHomeAssets(
        publicClient,
        getAddress(worldAddress),
        gameInjections,
        boardPromise,
        (metadata) => {
          if (stopped) return;
          setAssets((previous) => ({
            ...metadata,
            totalRewards:
              previous.tokenAddress === metadata.tokenAddress &&
              previous.pools[0]?.address === metadata.pools[0]?.address
                ? previous.totalRewards
                : undefined,
          }));
        },
      )
        .then((next) => {
          if (!stopped) setAssets(next);
        })
        .catch(async () => {
          const boards = await boardPromise;
          if (!stopped) {
            setAssets({
              ...EMPTY,
              boards,
              poolNote: "链上暂时读不到",
              rewardsUnavailable: true,
            });
          }
        })
        .finally(() => {
          inFlight = false;
        });
    };

    refresh();
    const timer = window.setInterval(refresh, HOME_ASSETS_POLL_MS);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [enabled, initialBlockNumber, publicClient, worldAddress]);

  return assets;
}
