import { resourceToHex } from "@latticexyz/common";
import {
  type Address,
  createPublicClient,
  custom,
  decodeFunctionData,
  encodeFunctionResult,
  encodePacked,
  type Hex,
  numberToHex,
  parseAbi,
  zeroAddress,
  zeroHash,
} from "viem";
import { bsc } from "viem/chains";
import { expect, it, vi } from "vitest";

import { readRewardClaimQuote } from "./claimRewardOrder";

const ACCOUNT = "0x1111111111111111111111111111111111111111";
const WORLD = "0x2222222222222222222222222222222222222222";
const POOL = "0x3333333333333333333333333333333333333333";
const COMMUNITY = "0x4444444444444444444444444444444444444444";
const COMMITTEE = "0x5555555555555555555555555555555555555555";
const UNRELATED = "0x6666666666666666666666666666666666666666";
const MULTICALL = bsc.contracts.multicall3.address;
const BLOCK = 135775900n;
const OPERATION_FEE = 500_000_000_000_000n;
const DFXSTAR_CONFIG = resourceToHex({
  type: "table",
  namespace: "df",
  name: "DFXStarConfig",
});

const AGGREGATE_ABI = parseAbi([
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[])",
]);
const CLAIM_READ_ABI = parseAbi([
  "function getRecord(bytes32 tableId, bytes32[] keys) view returns (bytes, bytes32, bytes)",
  "function world() view returns (address)",
  "function getCommunity() view returns (address)",
  "function getCommittee() view returns (address)",
  "function getPendingExternalRewards(address user) view returns (uint256)",
  "function getPoolPendingRewards(address pool, address user) view returns (uint256)",
  "function getPoolOperationFee() view returns (uint256)",
  "function getFeeFree(address user) view returns (bool)",
]);

function configRecord(pool: Address = POOL, community: Address = COMMUNITY) {
  return encodePacked(
    ["address", "address", "address", "address", "address", "uint16"],
    [pool, UNRELATED, UNRELATED, community, UNRELATED, 5000],
  );
}

function claimClient({
  chainId = bsc.id,
  blockNumber = BLOCK,
  staticRecord = configRecord(),
  boundWorld = WORLD,
  boundCommunity = COMMUNITY,
  committee = COMMITTEE,
  gamePending = 12n,
  communityPending = 34n,
  feeFree = false,
  failedCall,
}: {
  chainId?: number;
  blockNumber?: bigint;
  staticRecord?: Hex;
  boundWorld?: Address;
  boundCommunity?: Address;
  committee?: Address;
  gamePending?: bigint;
  communityPending?: bigint;
  feeFree?: boolean;
  failedCall?: string;
} = {}) {
  const stages: unknown[][] = [];
  const request = vi.fn(
    async ({
      method,
      params,
    }: {
      method: string;
      params?: readonly unknown[];
    }) => {
      if (method === "eth_chainId") return numberToHex(chainId);
      if (method === "eth_blockNumber") return numberToHex(blockNumber);
      expect(method).toBe("eth_call");
      const [transaction, blockTag] = params as [
        { to: Address; data: Hex },
        Hex,
      ];
      expect(transaction.to.toLowerCase()).toBe(MULTICALL.toLowerCase());
      expect(blockTag).toBe(numberToHex(blockNumber));
      const {
        args: [calls],
      } = decodeFunctionData({ abi: AGGREGATE_ABI, data: transaction.data });
      const stage: unknown[] = [];
      stages.push(stage);
      const response = calls.map(({ target, callData }) => {
        const { functionName, args } = decodeFunctionData({
          abi: CLAIM_READ_ABI,
          data: callData,
        });
        stage.push([target.toLowerCase(), functionName, args ?? []]);
        if (functionName === failedCall)
          return { success: false, returnData: "0x" } as const;
        const results = {
          getRecord: [staticRecord, zeroHash, "0x"],
          world: boundWorld,
          getCommunity: boundCommunity,
          getCommittee: committee,
          getPendingExternalRewards: gamePending,
          getPoolPendingRewards: communityPending,
          getPoolOperationFee: OPERATION_FEE,
          getFeeFree: feeFree,
        } as const;
        return {
          success: true,
          returnData: encodeFunctionResult({
            abi: CLAIM_READ_ABI,
            functionName,
            result: results[functionName],
          }),
        };
      });
      return encodeFunctionResult({
        abi: AGGREGATE_ABI,
        functionName: "aggregate3",
        result: response,
      });
    },
  );
  const client = createPublicClient({
    chain: bsc,
    transport: custom({ request }, { retryCount: 0 }),
  });
  return { client, request, stages };
}

it.each([
  ["game", false, 12n, OPERATION_FEE],
  ["game", true, 12n, 0n],
  ["community", true, 34n, OPERATION_FEE],
] as const)(
  "quotes %s rewards at one block with fee exemption set to %s",
  async (kind, feeFree, pendingWei, valueWei) => {
    const { client, request, stages } = claimClient({ feeFree });
    await expect(
      readRewardClaimQuote(client, {
        kind,
        worldAddress: WORLD,
        account: ACCOUNT,
      }),
    ).resolves.toMatchObject({
      chainId: bsc.id,
      worldAddress: WORLD,
      account: ACCOUNT,
      pool: POOL,
      community: COMMUNITY,
      pendingWei,
      valueWei,
    });

    expect(request.mock.calls.map(([call]) => call.method)).toEqual([
      "eth_chainId",
      "eth_blockNumber",
      "eth_call",
      "eth_call",
      "eth_call",
    ]);
    expect(stages).toEqual([
      [[WORLD, "getRecord", [DFXSTAR_CONFIG, []]]],
      [
        [POOL, "world", []],
        [POOL, "getCommunity", []],
        [COMMUNITY, "getCommittee", []],
        kind === "game"
          ? [POOL, "getPendingExternalRewards", [ACCOUNT]]
          : [COMMUNITY, "getPoolPendingRewards", [POOL, ACCOUNT]],
      ],
      kind === "game"
        ? [
            [COMMITTEE, "getPoolOperationFee", []],
            [COMMITTEE, "getFeeFree", [ACCOUNT]],
          ]
        : [[COMMITTEE, "getPoolOperationFee", []]],
    ]);
  },
);

it.each([
  ["empty World record", { staticRecord: "0x" }],
  ["missing pool", { staticRecord: configRecord(zeroAddress) }],
  ["missing community", { staticRecord: configRecord(POOL, zeroAddress) }],
  ["pool on the wrong World", { boundWorld: UNRELATED }],
  ["pool attached to another community", { boundCommunity: UNRELATED }],
  ["missing Committee", { committee: zeroAddress }],
  ["reward already claimed", { gamePending: 0n }],
  ["reverted Committee fee read", { failedCall: "getPoolOperationFee" }],
] as const)("rejects a quote with %s", async (_name, options) => {
  const { client, request, stages } = claimClient(options);
  await expect(
    readRewardClaimQuote(client, {
      kind: "game",
      worldAddress: WORLD,
      account: ACCOUNT,
    }),
  ).rejects.toThrow();
  expect(request.mock.calls.map(([call]) => call.method)).toEqual([
    "eth_chainId",
    "eth_blockNumber",
    ...stages.map(() => "eth_call"),
  ]);
});

it("stops before contract reads if the RPC reports another chain", async () => {
  const { client, request, stages } = claimClient({ chainId: 1 });
  await expect(
    readRewardClaimQuote(client, {
      kind: "game",
      worldAddress: WORLD,
      account: ACCOUNT,
    }),
  ).rejects.toThrow();
  expect(stages).toEqual([]);
  expect(request.mock.calls.some(([call]) => call.method === "eth_call")).toBe(
    false,
  );
});
