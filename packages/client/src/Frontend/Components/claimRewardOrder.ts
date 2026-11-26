import { resourceToHex } from "@latticexyz/common";
import {
  type Address,
  getAddress,
  isAddress,
  isAddressEqual,
  parseAbi,
  type PublicClient,
  size,
  sliceHex,
  zeroAddress,
} from "viem";

const DFXSTAR_CONFIG = resourceToHex({
  type: "table",
  namespace: "df",
  name: "DFXStarConfig",
});

const STORE_ABI = parseAbi([
  "function getRecord(bytes32 tableId, bytes32[] keyTuple) view returns (bytes, bytes32, bytes)",
]);
const POOL_ABI = parseAbi([
  "function world() view returns (address)",
  "function getCommunity() view returns (address)",
  "function getPendingExternalRewards(address account) view returns (uint256)",
]);
const COMMUNITY_ABI = parseAbi([
  "function getCommittee() view returns (address)",
  "function getPoolPendingRewards(address pool, address user) view returns (uint256)",
]);
const COMMITTEE_ABI = parseAbi([
  "function getPoolOperationFee() view returns (uint256)",
  "function getFeeFree(address account) view returns (bool)",
]);

export type RewardClaimKind = "game" | "community";
export class RewardClaimQuoteError extends Error {}

export async function readRewardClaimQuote(
  client: PublicClient,
  input: { kind: RewardClaimKind; worldAddress: Address; account: Address },
) {
  const worldAddress = requireAddress(input.worldAddress, "World 未配置");
  const account = requireAddress(input.account, "请先连接玩家钱包");
  const chain = client.chain;
  const multicall = chain?.contracts?.multicall3;
  if (!chain || !multicall)
    throw new RewardClaimQuoteError("当前链未配置 Multicall3");

  const chainId = await client.getChainId();
  if (chainId !== chain.id)
    throw new RewardClaimQuoteError("RPC 链与当前游戏网络不一致");
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
  if (BigInt(multicall.blockCreated ?? 0) > blockNumber)
    throw new RewardClaimQuoteError("当前区块无法使用 Multicall3");

  const snapshot = {
    blockNumber,
    multicallAddress: multicall.address,
    allowFailure: false,
  } as const;
  const [config] = await client.multicall({
    ...snapshot,
    contracts: [
      {
        address: worldAddress,
        abi: STORE_ABI,
        functionName: "getRecord",
        args: [DFXSTAR_CONFIG, []],
      },
    ],
  });
  const data = config?.[0];
  // The packed record begins with pool, payment token, factory and community.
  if (!data || size(data) < 80)
    throw new RewardClaimQuoteError("World 的奖励配置不完整");
  const pool = requireAddress(sliceHex(data, 0, 20), "World 未配置积分池");
  const community = requireAddress(sliceHex(data, 60, 80), "World 未配置社区");

  const game = input.kind === "game";
  const [poolWorld, poolCommunity, committeeAddress, pendingWei] =
    await client.multicall({
      ...snapshot,
      contracts: [
        { address: pool, abi: POOL_ABI, functionName: "world" },
        { address: pool, abi: POOL_ABI, functionName: "getCommunity" },
        {
          address: community,
          abi: COMMUNITY_ABI,
          functionName: "getCommittee",
        },
        game
          ? {
              address: pool,
              abi: POOL_ABI,
              functionName: "getPendingExternalRewards",
              args: [account],
            }
          : {
              address: community,
              abi: COMMUNITY_ABI,
              functionName: "getPoolPendingRewards",
              args: [pool, account],
            },
      ],
    });
  if (
    !poolWorld ||
    !poolCommunity ||
    !isAddressEqual(poolWorld, worldAddress) ||
    !isAddressEqual(poolCommunity, community)
  )
    throw new RewardClaimQuoteError(
      "积分池绑定的 World 或社区与游戏配置不一致",
    );
  const committee = requireAddress(committeeAddress, "社区未配置手续费委员会");
  if (typeof pendingWei !== "bigint")
    throw new RewardClaimQuoteError("无法读取待领奖励");
  if (pendingWei === 0n)
    throw new RewardClaimQuoteError("当前没有可领取的奖励");

  const feeRead = {
    address: committee,
    abi: COMMITTEE_ABI,
    functionName: "getPoolOperationFee",
  } as const;
  // Only the pool's external claim applies the direct caller's exemption.
  const [fee, isFeeFree] = game
    ? await client.multicall({
        ...snapshot,
        contracts: [
          feeRead,
          {
            address: committee,
            abi: COMMITTEE_ABI,
            functionName: "getFeeFree",
            args: [account],
          },
        ],
      })
    : await client.multicall({ ...snapshot, contracts: [feeRead] });
  if (typeof fee !== "bigint" || (game && typeof isFeeFree !== "boolean"))
    throw new RewardClaimQuoteError("无法读取领奖手续费");

  return {
    chainId,
    worldAddress,
    account,
    pool,
    community,
    pendingWei,
    valueWei: isFeeFree === true ? 0n : fee,
  };
}

function requireAddress(address: string | undefined, message: string): Address {
  if (
    !address ||
    !isAddress(address, { strict: false }) ||
    isAddressEqual(address, zeroAddress)
  )
    throw new RewardClaimQuoteError(message);
  return getAddress(address);
}
