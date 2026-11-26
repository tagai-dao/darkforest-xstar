import {
  concatHex,
  numberToHex,
  parseEther,
  type PublicClient,
  zeroHash,
} from "viem";
import { bsc } from "viem/chains";
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadHomeAssets, readGameInjections } from "./useHomeAssets";

const POOL = "0x375dED0C49aEb8DdD3E9DB6A4b5c84A0adD93C9F";
const TOKEN = "0x935FB3D106c259840d4abE96351867fb63123333";
const COMMUNITY = "0xfB710BE94918e999877b55003173C04375774d46";
const LOCKER = "0x0000000000000000000000000000000000000001";
const NFT = "0xD0ac6355Deb37711fBf365838c755D2BC44EB32A";
const CALCULATOR = "0x6cCEC02E7D371FED954D7D16eCb7F2f57cccF54d";
const BLOCK = 135775900n;
const HEAD = 1795662000n;
const WORLD = "0xfaD1cDDAD97113e4c0335FF5A815955c21b2ddca";
const CONFIG_TABLE =
  "0x7462646600000000000000000000000044465853746172436f6e666967000000";
const PASS_TABLE =
  "0x7462646600000000000000000000000047616d65506173734e46540000000000";
const UNUSED_ADDRESS = "0x0000000000000000000000000000000000000000";

const CIRCLE_TABLE =
  "0x74626466000000000000000000000000496e6e6572436972636c650000000000";
const FRONTIER_TABLE =
  "0x7462646600000000000000000000000053696c76657246726f6e746965720000";
const STATS_TABLE =
  "0x74626466000000000000000000000000476c6f62616c53746174730000000000";
const REGISTRY = "0x0000000000000000000000000000000000000020";
const PLAYER = "0x0000000000000000000000000000000000000030";
const PLAYER_WITHOUT_HANDLE = "0x0000000000000000000000000000000000000040";

type Query = {
  address: string;
  functionName: string;
  args?: readonly unknown[];
};

function assetClient(released?: bigint) {
  const response: Record<string, unknown> = {
    getTotalStakedAmount: 1000n,
    getCommunity: COMMUNITY,
    [`${TOKEN}.symbol`]: "Starship",
    balanceOf: parseEther("5000"),
    decimals: 18,
    nft: NFT,
    rewardCalculator: CALCULATOR,
    getCommunityToken: TOKEN,
    getCurrentRewardRate: parseEther("100"),
    handleRegistry: REGISTRY,
    [PLAYER]: "explorer",
    name: "Game Pass NFT",
    [`${NFT}.symbol`]: "PASS",
    totalSupply: 1n,
    maxSupply: 100n,
    communityTokenPrice: parseEther("100000"),
    nativePrice: parseEther("0.001"),
    calculateReward: released,
    [CONFIG_TABLE]: [
      concatHex([
        POOL,
        TOKEN,
        UNUSED_ADDRESS,
        COMMUNITY,
        UNUSED_ADDRESS,
        "0x1388",
      ]),
      zeroHash,
      "0x",
    ],
    [PASS_TABLE]: [LOCKER, zeroHash, "0x"],
    [CIRCLE_TABLE]: [numberToHex(67500, { size: 8 }), zeroHash, "0x"],
    [FRONTIER_TABLE]: ["0x05", zeroHash, "0x"],
    [STATS_TABLE]: [
      concatHex([numberToHex(11, { size: 32 }), numberToHex(8, { size: 32 })]),
      zeroHash,
      "0x",
    ],
  };
  return {
    chain: bsc,
    getBlock: vi
      .fn()
      .mockResolvedValue({ number: BLOCK, timestamp: HEAD + 120n }),
    getLogs: vi
      .fn()
      .mockResolvedValueOnce([{ args: { amount: parseEther("10000") } }])
      .mockResolvedValueOnce([{ args: { amount: parseEther("20000") } }])
      .mockResolvedValue([]),
    multicall: vi.fn(({ contracts }: { contracts: Query[] }) =>
      Promise.resolve(
        contracts.map(({ address, functionName, args }) => {
          const key =
            functionName === "getRecord" || functionName === "handleOf"
              ? String(args?.[0])
              : functionName;
          const result = response[`${address}.${key}`] ?? response[key];
          return result === undefined
            ? { status: "failure" }
            : { status: "success", result };
        }),
      ),
    ),
  };
}

describe("home assets", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("pins all stages to one Multicall3 snapshot and totals released and injected rewards", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const mock = assetClient(parseEther("60000"));
    const client = mock as unknown as PublicClient;
    const history = readGameInjections(BLOCK - 10000n);
    const rows = [
      { address: PLAYER, score: "12000", kills: "4000", rank: 1 },
      { address: PLAYER_WITHOUT_HANDLE, score: "4000", kills: "1000", rank: 2 },
    ];
    const assets = await loadHomeAssets(
      client,
      WORLD,
      history,
      Promise.resolve({ score: rows, kills: rows }),
    );
    expect(assets.match).toMatchObject({ players: 8, maxPlanetLevel: 5 });
    expect(assets.match?.shrinkPct).toBeCloseTo(10);
    expect(assets.handles).toEqual(new Map([[PLAYER, "explorer"]]));

    expect(assets.totalRewards).toBe("90,000");
    expect(assets.nfts[0]).toMatchObject({
      address: NFT,
      mintPrice: "100,000 Starship + 0.001 BNB",
      soldOut: false,
    });
    expect(mock.getBlock).toHaveBeenCalledWith({ blockTag: "finalized" });
    expect(
      mock.multicall.mock.calls.map(([call]) =>
        call.contracts.map(({ address, functionName, args }) => [
          address,
          functionName,
          args ?? [],
        ]),
      ),
    ).toEqual([
      [
        [WORLD, "getRecord", [CONFIG_TABLE, []]],
        [WORLD, "getRecord", [PASS_TABLE, []]],
        [WORLD, "getRecord", [CIRCLE_TABLE, []]],
        [WORLD, "getRecord", [FRONTIER_TABLE, []]],
        [WORLD, "getRecord", [STATS_TABLE, []]],
      ],
      [
        [POOL, "getTotalStakedAmount", []],
        [POOL, "getCommunity", []],
        [TOKEN, "symbol", []],
        [TOKEN, "balanceOf", ["0x000000000000000000000000000000000000dEaD"]],
        [TOKEN, "decimals", []],
        [LOCKER, "nft", []],
        [LOCKER, "handleRegistry", []],
        [COMMUNITY, "rewardCalculator", []],
        [COMMUNITY, "getCommunityToken", []],
      ],
      [
        [CALCULATOR, "getCurrentRewardRate", [COMMUNITY]],
        [CALCULATOR, "calculateReward", [COMMUNITY, 0n, HEAD]],
        ...[
          "name",
          "symbol",
          "totalSupply",
          "maxSupply",
          "communityTokenPrice",
          "nativePrice",
        ].map((name) => [NFT, name, []]),
        [REGISTRY, "handleOf", [PLAYER]],
        [REGISTRY, "handleOf", [PLAYER_WITHOUT_HANDLE]],
      ],
    ]);
    for (const [call] of mock.multicall.mock.calls) {
      expect(call).toMatchObject({
        multicallAddress: bsc.contracts.multicall3.address,
        blockNumber: BLOCK,
      });
    }
    expect(mock.getLogs.mock.calls.map(([args]) => args)).toMatchObject([
      {
        address: POOL,
        event: { name: "InjectedRewards" },
        fromBlock: BLOCK - 10000n,
        toBlock: BLOCK - 1n,
      },
      {
        address: POOL,
        event: { name: "InjectedRewards" },
        fromBlock: BLOCK,
        toBlock: BLOCK,
      },
    ]);
    expect(await history(client, POOL, BLOCK + 1n)).toBe(parseEther("30000"));
    expect(mock.getLogs).toHaveBeenLastCalledWith(
      expect.objectContaining({ fromBlock: BLOCK + 1n, toBlock: BLOCK + 1n }),
    );
  });

  it("uses the verified reward checkpoint only for the matching BSC round and pool", async () => {
    const getLogs = vi
      .fn()
      .mockResolvedValue([{ args: { amount: parseEther("1.5") } }]);
    const client = { chain: bsc, getLogs } as unknown as PublicClient;
    const history = readGameInjections(135405573n, WORLD);
    const nextBlock = 135779389n;

    expect(await history(client, POOL, nextBlock)).toBe(parseEther("7033"));
    expect(getLogs).toHaveBeenCalledTimes(1);
    expect(getLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        address: POOL,
        event: expect.objectContaining({ name: "InjectedRewards" }),
        fromBlock: nextBlock,
        toBlock: nextBlock,
      }),
    );
    getLogs.mockClear();
    expect(await history(client, LOCKER, nextBlock)).not.toBe(
      parseEther("7033"),
    );
    expect(getLogs).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ address: LOCKER, fromBlock: 135405573n }),
    );
  });

  it("keeps a partial reward total hidden when the community release read fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const mock = assetClient();
    const assets = await loadHomeAssets(
      mock as unknown as PublicClient,
      WORLD,
      vi.fn().mockResolvedValue(parseEther("30000")),
    );

    expect(assets.totalRewards).toBeUndefined();
    expect(assets.rewardsUnavailable).toBe(true);
    expect(assets.nfts[0]?.mintPrice).toBe("100,000 Starship + 0.001 BNB");
  });
});
