import {
  type Address,
  createPublicClient,
  custom,
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionResult,
  type Hex,
  parseAbi,
  zeroAddress,
} from "viem";
import { bsc } from "viem/chains";
import { expect, it, vi } from "vitest";

import {
  formatNativeBalance,
  readGameAccountSnapshot,
} from "./gameAccountSnapshot";

const ACCOUNT = "0x1111111111111111111111111111111111111111";
const TOKEN = "0x2222222222222222222222222222222222222222";
const LOCKER = "0x3333333333333333333333333333333333333333";
const POOL = "0x4444444444444444444444444444444444444444";
const COMMUNITY = "0x5555555555555555555555555555555555555555";
const MULTICALL = bsc.contracts.multicall3.address;
const BLOCK = "0x2e90edd";

const AGGREGATE_ABI = parseAbi([
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[])",
]);
const READ_ABI = parseAbi([
  "function getEthBalance(address account) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function stakedTokenOf(address account) view returns (uint256)",
  "function stakerOf(uint256 id) view returns (address)",
  "function getPendingExternalRewards(address account) view returns (uint256)",
  "function getPendingCommunityRewards(address account) view returns (uint256)",
]);
const targets = {
  aipro: TOKEN,
  locker: LOCKER,
  pool: POOL,
  community: COMMUNITY,
} as const;

function walletClient({
  tokenId = 17n,
  zeroStaker = zeroAddress,
  failBalance = false,
}: { tokenId?: bigint; zeroStaker?: Address; failBalance?: boolean } = {}) {
  const subcalls: unknown[] = [];
  const request = vi.fn(
    async ({
      method,
      params,
    }: {
      method: string;
      params?: readonly unknown[];
    }) => {
      if (method === "eth_blockNumber") return BLOCK;
      expect(method).toBe("eth_call");
      const [transaction, blockTag] = params as [
        { to: string; data: Hex },
        Hex,
      ];
      expect(transaction.to).toBe(MULTICALL);
      expect(blockTag).toBe(BLOCK);
      const {
        args: [calls],
      } = decodeFunctionData({ abi: AGGREGATE_ABI, data: transaction.data });
      const result = calls.map(({ target, callData }) => {
        const { functionName, args } = decodeFunctionData({
          abi: READ_ABI,
          data: callData,
        });
        subcalls.push([target.toLowerCase(), functionName, args ?? []]);
        if (functionName === "balanceOf" && failBalance)
          return { success: false, returnData: "0x" } as const;
        const data = {
          getEthBalance: 143_250_000_000_000_000n,
          balanceOf: 765_432_100n,
          decimals: 6n,
          stakedTokenOf: tokenId,
          getPendingExternalRewards: 12n,
          getPendingCommunityRewards: 34n,
        };
        const returnData =
          functionName === "stakerOf"
            ? encodeAbiParameters([{ type: "address" }], [zeroStaker])
            : encodeAbiParameters([{ type: "uint256" }], [data[functionName]]);
        return { success: true, returnData };
      });
      return encodeFunctionResult({
        abi: AGGREGATE_ABI,
        functionName: "aggregate3",
        result,
      });
    },
  );
  const client = createPublicClient({
    chain: bsc,
    transport: custom({ request }, { retryCount: 0 }),
  });
  return { client, request, subcalls };
}

it("uses the verified Multicall3 target for all wallet and reward reads at one block", async () => {
  const { client, request, subcalls } = walletClient();
  await expect(
    readGameAccountSnapshot(client, ACCOUNT, targets),
  ).resolves.toEqual({
    native: { amount: 143_250_000_000_000_000n, symbol: "BNB", decimals: 18 },
    aipro: { amount: 765_432_100n, decimals: 6 },
    stakedNftId: 17n,
    reward: {
      game: 12n,
      communityPending: 34n,
      pool: POOL,
      community: COMMUNITY,
    },
  });
  expect(request.mock.calls.map(([call]) => call.method)).toEqual([
    "eth_blockNumber",
    "eth_call",
  ]);
  expect(subcalls).toEqual([
    [MULTICALL, "getEthBalance", [ACCOUNT]],
    [TOKEN, "balanceOf", [ACCOUNT]],
    [TOKEN, "decimals", []],
    [LOCKER, "stakedTokenOf", [ACCOUNT]],
    [LOCKER, "stakerOf", [0n]],
    [POOL, "getPendingExternalRewards", [ACCOUNT]],
    [POOL, "getPendingCommunityRewards", [ACCOUNT]],
  ]);
});

it.each([
  [ACCOUNT, 0n],
  [zeroAddress, null],
] as const)(
  "distinguishes NFT zero held by %s from no stake",
  async (zeroStaker, stakedNftId) => {
    const { client } = walletClient({ tokenId: 0n, zeroStaker });
    await expect(
      readGameAccountSnapshot(client, ACCOUNT, { locker: LOCKER }),
    ).resolves.toMatchObject({ stakedNftId });
  },
);

it("rejects the snapshot on subcall failure without direct contract RPC fallback", async () => {
  const { client, request } = walletClient({ failBalance: true });
  await expect(
    readGameAccountSnapshot(client, ACCOUNT, targets),
  ).rejects.toThrow();
  expect(request.mock.calls.map(([call]) => call.method)).toEqual([
    "eth_blockNumber",
    "eth_call",
  ]);
});

it("keeps zero and sub-display-unit native balances distinguishable", () => {
  expect(formatNativeBalance({ amount: 0n, decimals: 18 })).toBe("0");
  expect(formatNativeBalance({ amount: 1n, decimals: 18 })).toBe("<0.000001");
  expect(
    formatNativeBalance({ amount: 143_250_000_000_000_000n, decimals: 18 }),
  ).toBe("0.14325");
});
