import {
  type Address,
  encodeAbiParameters,
  formatEther,
  isAddressEqual,
  keccak256,
  maxUint256,
  parseAbi,
  parseAbiParameters,
  parseEther,
  type PublicClient,
  zeroAddress,
  zeroHash,
} from "viem";

import { skillEntryPath } from "./skillPack";

const TAGCLAW_SKILL =
  "https://github.com/tagai-dao/TagClaw-Website/tree/main/public/skills/tagclaw-onchain";
const PUMP_V14: Address = "0xcd4e721Fc418f4D723C04c71e8d8EcCb75C3CD34";
const CURVE_CAP = parseEther("650000000");
const MANAGER: Address = "0xa0FfB9c1CE1Fe56963B0321B32E7A0302114058b";
const QUOTER: Address = "0xd0737C9762912dD34c3271197E362Aa736Df0926";
const AGENT_SWAP: Address = "0x3F7146D3D234Ed4C2021DE1A5B14da8754e6C577";

const tokenAbi = parseAbi([
  "function listed() view returns (bool)",
  "function listingPending() view returns (bool)",
  "function bondingCurveSupply() view returns (uint256)",
  "function getBuyFeeRatios() view returns (uint256, uint256)",
  "function v4PoolId() view returns (bytes32)",
  "function decimals() view returns (uint8)",
]);

const pumpAbi = parseAbi([
  "function createdTokens(address token) view returns (bool)",
  "function getBuyAmountByValue(uint256 supply, uint256 value) view returns (uint256)",
]);

const poolKeyFields =
  "address currency0, address currency1, address hooks, address poolManager, uint24 fee, bytes32 parameters";
const poolKeyAbi = parseAbi([
  `function poolIdToPoolKey(bytes32 id) view returns ((${poolKeyFields}))`,
]);
const poolKeyParams = parseAbiParameters(`(${poolKeyFields})`);
const swapSourceParams = parseAbiParameters(
  `(address quoter, (${poolKeyFields}) pool)`,
);
const swapAbi = parseAbi([
  "function quoteBuy(address token, uint8 sourceType, bytes sourceData, uint256 amount) returns (uint256)",
]);

export function parsePurchaseAmount(value: string): bigint | undefined {
  const text = value.trim();
  if (!/^(?:\d{1,78}(?:\.\d{0,18})?|\.\d{1,18})$/.test(text)) return undefined;
  const wei = parseEther(text);
  return wei > 0n && wei <= maxUint256 ? wei : undefined;
}

/** TagClaw's curve or AgentSwap quote for the current game token on BSC. */
export async function quoteHomeTokenBuy(
  publicClient: PublicClient,
  token: Address,
  amount: bigint,
): Promise<{ out: bigint; decimals: number }> {
  const multicall = publicClient.chain?.contracts?.multicall3;
  if (publicClient.chain?.id !== 56 || !multicall) {
    throw new Error("BSC Multicall3 is required");
  }
  const blockNumber = await publicClient.getBlockNumber({ cacheTime: 0 });
  if (BigInt(multicall.blockCreated ?? 0) > blockNumber) {
    throw new Error("Multicall3 is unavailable at the current block");
  }
  const snapshot = {
    blockNumber,
    multicallAddress: multicall.address,
    allowFailure: false,
  } as const;
  const [
    registered,
    listed,
    pending,
    decimals,
    supply,
    [platformFee, referralFee],
    poolId,
  ] = await publicClient.multicall({
    ...snapshot,
    contracts: [
      {
        address: PUMP_V14,
        abi: pumpAbi,
        functionName: "createdTokens",
        args: [token],
      },
      { address: token, abi: tokenAbi, functionName: "listed" },
      { address: token, abi: tokenAbi, functionName: "listingPending" },
      { address: token, abi: tokenAbi, functionName: "decimals" },
      { address: token, abi: tokenAbi, functionName: "bondingCurveSupply" },
      { address: token, abi: tokenAbi, functionName: "getBuyFeeRatios" },
      { address: token, abi: tokenAbi, functionName: "v4PoolId" },
    ],
  });
  if (!registered || pending) throw new Error("Token market unavailable");

  if (!listed) {
    if (platformFee + referralFee >= 10_000n || supply >= CURVE_CAP) {
      throw new Error("Invalid curve state");
    }
    const net =
      amount -
      (amount * platformFee) / 10_000n -
      (amount * referralFee) / 10_000n;
    const [out] = await publicClient.multicall({
      ...snapshot,
      contracts: [
        {
          address: PUMP_V14,
          abi: pumpAbi,
          functionName: "getBuyAmountByValue",
          args: [supply, net],
        },
      ],
    });
    const remaining = CURVE_CAP - supply;
    return { out: out < remaining ? out : remaining, decimals };
  }

  if (poolId === zeroHash) throw new Error("Missing token pool");

  const [pool] = await publicClient.multicall({
    ...snapshot,
    contracts: [
      {
        address: MANAGER,
        abi: poolKeyAbi,
        functionName: "poolIdToPoolKey",
        args: [poolId],
      },
    ],
  });
  if (
    !isAddressEqual(pool.currency0, zeroAddress) ||
    !isAddressEqual(pool.currency1, token) ||
    !isAddressEqual(pool.poolManager, MANAGER) ||
    keccak256(encodeAbiParameters(poolKeyParams, [pool])) !== poolId
  ) {
    throw new Error("Token pool does not match the configured market");
  }

  // quoteBuy (non-view) is executed during eth_call on the same snapshot.
  const [out] = await publicClient.multicall({
    ...snapshot,
    contracts: [
      {
        address: AGENT_SWAP,
        abi: swapAbi,
        functionName: "quoteBuy",
        args: [
          token,
          3,
          encodeAbiParameters(swapSourceParams, [{ quoter: QUOTER, pool }]),
          amount,
        ],
      },
    ],
  });
  return { out, decimals };
}

export function tokenPurchaseInstructions(token: Address, amount: bigint) {
  return [
    `请用我已登录的 Binance Agentic Wallet 在 BNB Smart Chain（56）上，用 ${formatEther(amount)} BNB 购买 Dark Forest Punk 的游戏代币。`,
    `代币合约：${token}`,
    `请按 TagClaw 链上交易说明确认市场并获取最新报价：${TAGCLAW_SKILL}`,
    "先展示预计到账、最少到账、费用与交易预览，等我明确确认后再提交。",
  ].join("\n");
}

export function nftPurchaseInstructions(
  site: string,
  world: string,
  nft: Address,
  paymentToken: Address | undefined,
) {
  return [
    "请用我已登录的 Binance Agentic Wallet 在 BNB Smart Chain（56）上为 Dark Forest Punk 铸造 1 枚 Game Pass NFT。",
    `游戏说明：${new URL(skillEntryPath, site).href}`,
    `世界合约：${world}`,
    `当前 Game Pass NFT 合约：${nft}`,
    ...(paymentToken ? [`游戏支付代币：${paymentToken}`] : []),
    "请先核对世界的入场 NFT 配置、钱包 Handle、实时铸造价与原生币费用。先给我预览，等我明确确认后再按合约要求授权并铸造。",
  ].join("\n");
}
