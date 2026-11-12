/**
 * 购银报价。必须和合约 `SilverMarket.sol` 使用同一张表、同一种舍入。
 * 价格是整枚 AIPRO，银是页面数量。链上银再乘 1000，链上价格再乘 1e18。
 */

export const SILVER_TIER_PERCENTS = [20, 50, 80, 150] as const;

/** 行是 1 到 9 级，列是 20% / 50% / 80% / 150%。 */
const BASE_PRICES = [
  [1000, 2500, 4000, 7500],
  [2500, 6250, 10000, 18750],
  [6250, 15625, 25000, 46875],
  [15000, 37500, 60000, 112500],
  [34000, 85000, 135000, 255000],
  [50000, 125000, 200000, 375000],
  [75000, 187500, 300000, 562500],
  [95000, 237500, 380000, 712500],
  [110000, 275000, 440000, 825000],
] as const;

const BASE_SILVER = [
  [20, 50, 80, 150],
  [100, 250, 400, 750],
  [500, 1250, 2000, 3750],
  [2400, 6000, 9600, 18000],
  [10000, 25000, 40000, 75000],
  [20000, 50000, 80000, 150000],
  [40000, 100000, 160000, 300000],
  [60000, 150000, 240000, 450000],
  [80000, 200000, 320000, 600000],
] as const;

export type SilverQuote = {
  /** 折扣后的整枚代币。半枚进一。 */
  priceWhole: number;
  priceWei: bigint;
  /** 页面上的银，不随进度变化。 */
  silverDisplay: number;
  /** 100 表示原价。进度每高一级少 10。 */
  percent: number;
};

export function quoteSilverPurchase(
  level: number,
  tier: number,
  frontier: number,
): SilverQuote | undefined {
  if (level < 1 || level > 9 || tier < 0 || tier > 3) return undefined;

  const base = BASE_PRICES[level - 1][tier];
  const silverDisplay = BASE_SILVER[level - 1][tier];
  const percent =
    frontier > level ? Math.max(0, 100 - (frontier - level) * 10) : 100;
  const priceWhole = Math.floor((base * percent + 50) / 100);

  return {
    priceWhole,
    priceWei: BigInt(priceWhole) * 10n ** 18n,
    silverDisplay,
    percent,
  };
}
