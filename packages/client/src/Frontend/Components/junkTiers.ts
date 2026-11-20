/** 购买弹窗里列出的最高档位。档位乘以 1000 就是额度上限，所以这里到 20000 额度。 */
export const JUNK_QUOTE_MAX_ALLOCATION = 20;

export type JunkTierQuote = {
  /** 档位。链上存的额度上限是档位乘以 1000。 */
  allocation: number;
  /** 买到这一档后的额度上限。 */
  limit: number;
  /** 从当前档升到这一档要付的差价，单位 wei。已拥有的档位是 0。 */
  priceWei: bigint;
  /** 当前档位已经达到或超过这一档，不能再买。 */
  owned: boolean;
};

/**
 * 列出 2 档到最高档的报价。
 * feeOf 给出某一档的累计价格，实际支付的是目标档和当前档累计价格的差。
 */
export function junkTierQuotes(
  currentAllocation: number,
  feeOf: (allocation: number) => bigint,
): JunkTierQuote[] {
  const currentFee = feeOf(currentAllocation);
  return Array.from({ length: JUNK_QUOTE_MAX_ALLOCATION - 1 }, (_, index) => {
    const allocation = index + 2;
    const owned = allocation <= currentAllocation;
    return {
      allocation,
      limit: allocation * 1000,
      owned,
      priceWei: owned ? 0n : feeOf(allocation) - currentFee,
    };
  });
}
