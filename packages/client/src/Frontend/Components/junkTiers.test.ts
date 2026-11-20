import { describe, expect, it } from "vitest";

import { JUNK_QUOTE_MAX_ALLOCATION, junkTierQuotes } from "./junkTiers";

// 和 df.config.toml 一致的价格：基础单价 0.003 BNB，1 档免费，
// 2 到 8 档每档加一个单价，9 档起在 7 个单价上加 (档位 - 8)² 个单价。
const BASE = 3000000000000000n;
function feeOf(allocation: number): bigint {
  if (allocation <= 1) return 0n;
  if (allocation <= 8) return BigInt(allocation - 1) * BASE;
  const t = BigInt(allocation - 8);
  return (7n + t * t) * BASE;
}

describe("junk tier quotes", () => {
  it("lists tiers 2 to 20 and prices each as the step from the current tier", () => {
    const quotes = junkTierQuotes(1, feeOf);

    expect(quotes).toHaveLength(JUNK_QUOTE_MAX_ALLOCATION - 1);
    expect(quotes[0]).toEqual({
      allocation: 2,
      limit: 2000,
      owned: false,
      priceWei: 3000000000000000n,
    });
    // 9 档累计 0.024 BNB，减去 1 档的 0。
    expect(quotes.find((quote) => quote.allocation === 9)?.priceWei).toBe(
      24000000000000000n,
    );
    expect(quotes.at(-1)).toMatchObject({ allocation: 20, limit: 20000 });
  });

  it("prices from the current tier and marks owned tiers", () => {
    const quotes = junkTierQuotes(9, feeOf);
    const byTier = new Map(quotes.map((quote) => [quote.allocation, quote]));

    expect(byTier.get(2)).toMatchObject({ owned: true, priceWei: 0n });
    expect(byTier.get(9)).toMatchObject({ owned: true, priceWei: 0n });
    // 10 档累计 0.033，减去 9 档的 0.024，差价 0.009 BNB。
    expect(byTier.get(10)).toMatchObject({
      owned: false,
      priceWei: 9000000000000000n,
    });
  });

  it("marks every listed tier owned when the wallet is above the list", () => {
    const quotes = junkTierQuotes(50, feeOf);
    expect(quotes.every((quote) => quote.owned && quote.priceWei === 0n)).toBe(
      true,
    );
  });
});
