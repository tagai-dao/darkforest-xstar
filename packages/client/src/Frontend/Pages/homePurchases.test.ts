import {
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  parseEther,
  type PublicClient,
  zeroAddress,
  zeroHash,
} from "viem";
import { bsc } from "viem/chains";
import { describe, expect, it, vi } from "vitest";

import {
  nftPurchaseInstructions,
  parsePurchaseAmount,
  quoteHomeTokenBuy,
  tokenPurchaseInstructions,
} from "./homePurchases";

const TOKEN = "0x935FB3D106c259840d4abE96351867fb63123333";
const PUMP = "0xcd4e721Fc418f4D723C04c71e8d8EcCb75C3CD34";
const MANAGER = "0xa0FfB9c1CE1Fe56963B0321B32E7A0302114058b";
const WRAPPER = "0x3F7146D3D234Ed4C2021DE1A5B14da8754e6C577";
const BLOCK = 135775900n;

function quoteClient() {
  return {
    chain: bsc,
    getBlockNumber: vi.fn().mockResolvedValue(BLOCK),
    multicall: vi.fn(),
  };
}

describe("home purchase", () => {
  it("accepts only a positive BNB decimal representable in wei", () => {
    expect(parsePurchaseAmount(".002")).toBe(parseEther("0.002"));
    expect(parsePurchaseAmount("0.000000000000000001")).toBe(1n);
    for (const input of [
      "",
      "0",
      "-1",
      "1e3",
      "1.0000000000000000001",
      "9".repeat(78),
    ]) {
      expect(parsePurchaseAmount(input)).toBeUndefined();
    }
  });

  it("copies the configured token or NFT address and requests confirmation", () => {
    expect(tokenPurchaseInstructions(TOKEN, parseEther("0.02"))).toContain(
      "0.02 BNB",
    );
    expect(tokenPurchaseInstructions(TOKEN, 1n)).toContain(TOKEN);
    const nft = "0xD0ac6355Deb37711fBf365838c755D2BC44EB32A";
    const instruction = nftPurchaseInstructions(
      "https://game.example",
      zeroAddress,
      nft,
      TOKEN,
    );
    expect(instruction).toContain(nft);
    expect(instruction).toContain("铸造 1 枚");
    expect(instruction).toContain("等我明确确认");
  });

  it("quotes the curve at a single block, subtracts both fees, and caps at remaining supply", async () => {
    const mock = quoteClient();
    const supply = parseEther("649999999");
    mock.multicall
      .mockResolvedValueOnce([
        true,
        false,
        false,
        18,
        supply,
        [30n, 30n],
        zeroHash,
      ])
      .mockResolvedValueOnce([parseEther("20")]);
    const result = await quoteHomeTokenBuy(
      mock as unknown as PublicClient,
      TOKEN,
      parseEther("1"),
    );
    expect(result).toEqual({ out: parseEther("1"), decimals: 18 });

    const stage = {
      multicallAddress: bsc.contracts.multicall3.address,
      blockNumber: BLOCK,
      allowFailure: false,
    };
    expect(mock.multicall.mock.calls).toMatchObject([
      [
        {
          ...stage,
          contracts: [
            { address: PUMP, functionName: "createdTokens", args: [TOKEN] },
            { address: TOKEN, functionName: "listed" },
            { address: TOKEN, functionName: "listingPending" },
            { address: TOKEN, functionName: "decimals" },
            { address: TOKEN, functionName: "bondingCurveSupply" },
            { address: TOKEN, functionName: "getBuyFeeRatios" },
            { address: TOKEN, functionName: "v4PoolId" },
          ],
        },
      ],
      [
        {
          ...stage,
          contracts: [
            {
              address: PUMP,
              functionName: "getBuyAmountByValue",
              args: [supply, parseEther("0.994")],
            },
          ],
        },
      ],
    ]);
  });

  it("verifies the token's listed pool before quoting through AgentSwap", async () => {
    const pool = {
      currency0: zeroAddress,
      currency1: TOKEN,
      hooks: zeroAddress,
      poolManager: MANAGER,
      fee: 500,
      parameters: zeroHash,
    } as const;
    const id = keccak256(
      encodeAbiParameters(
        parseAbiParameters(
          "(address currency0, address currency1, address hooks, address poolManager, uint24 fee, bytes32 parameters)",
        ),
        [pool],
      ),
    );
    const mock = quoteClient();
    const amount = parseEther("0.001");
    mock.multicall
      .mockResolvedValueOnce([true, true, false, 18, 0n, [30n, 30n], id])
      .mockResolvedValueOnce([pool])
      .mockResolvedValueOnce([20n]);

    await expect(
      quoteHomeTokenBuy(mock as unknown as PublicClient, TOKEN, amount),
    ).resolves.toEqual({ out: 20n, decimals: 18 });
    const stage = {
      blockNumber: BLOCK,
      multicallAddress: bsc.contracts.multicall3.address,
    };
    expect(mock.multicall).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        ...stage,
        contracts: expect.arrayContaining([
          expect.objectContaining({ address: TOKEN, functionName: "v4PoolId" }),
        ]),
      }),
    );
    expect(mock.multicall).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        ...stage,
        contracts: [
          expect.objectContaining({
            address: MANAGER,
            functionName: "poolIdToPoolKey",
            args: [id],
          }),
        ],
      }),
    );
    expect(mock.multicall).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        ...stage,
        contracts: [
          expect.objectContaining({
            address: WRAPPER,
            functionName: "quoteBuy",
            args: [TOKEN, 3, expect.any(String), amount],
          }),
        ],
      }),
    );
  });
});
