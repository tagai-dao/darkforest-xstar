import { describe, expect, it } from "vitest";

import { quoteSilverPurchase } from "./silverMarket";

describe("silver market quote", () => {
  it("keeps the frontier planet at full price", () => {
    const quote = quoteSilverPurchase(5, 0, 5);
    expect(quote).toMatchObject({
      priceWhole: 34000,
      silverDisplay: 10000,
      percent: 100,
    });
    expect(quote?.priceWei).toBe(34000n * 10n ** 18n);
  });

  it("discounts one step per level below the frontier", () => {
    expect(quoteSilverPurchase(1, 0, 2)?.percent).toBe(90);
    expect(quoteSilverPurchase(1, 0, 9)?.percent).toBe(20);
    expect(quoteSilverPurchase(8, 0, 9)?.percent).toBe(90);
  });

  it("rounds a half token up", () => {
    // 15625 × 90% = 14062.5
    expect(quoteSilverPurchase(3, 1, 4)?.priceWhole).toBe(14063);
    expect(quoteSilverPurchase(3, 1, 4)?.silverDisplay).toBe(1250);
  });

  it("does not discount when nobody has captured a planet yet", () => {
    expect(quoteSilverPurchase(1, 0, 0)?.percent).toBe(100);
    expect(quoteSilverPurchase(1, 0, 0)?.priceWhole).toBe(1000);
  });

  it("rejects level 0 and an unknown tier", () => {
    expect(quoteSilverPurchase(0, 0, 0)).toBeUndefined();
    expect(quoteSilverPurchase(5, 4, 5)).toBeUndefined();
  });
});
