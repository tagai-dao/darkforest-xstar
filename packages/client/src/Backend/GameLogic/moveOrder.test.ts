import type { LocationId } from "@df/types";
import { describe, expect, it } from "vitest";

import {
  buildMoveOrder,
  formatBuySilverOrder,
  formatUpgradeOrder,
  formatWithdrawMaterialOrder,
  formatWithdrawSilverOrder,
} from "./moveOrder";

const FROM =
  "000000000000000000000000000000000000000000000000000000000000000a" as LocationId;
const TO =
  "000000000000000000000000000000000000000000000000000000000000000b" as LocationId;

describe("move order", () => {
  it("keeps the circuit inputs and chain amounts the drag would have sent", () => {
    const order = buildMoveOrder({
      fromId: FROM,
      toId: TO,
      fromX: 3,
      fromY: 4,
      toX: 6,
      toY: 8,
      worldRadius: 100000,
      forces: 5,
      silver: 2,
      abandoning: false,
      materials: [{ materialId: 1, materialAmount: 4 }],
      planetHashKey: 1729,
      spaceTypeKey: 1730,
      scale: 8192,
      mirrorX: false,
      mirrorY: false,
      entryFeeWei: 1000000000000n,
    });

    expect(order.kind).toBe("darkforest-move");
    expect(order.call).toBe("df__move");
    expect(order.fromHash).toBe("10");
    expect(order.toHash).toBe("11");
    expect(order.fromHashHex).toBe(FROM);
    expect(order.toHashHex).toBe(TO);
    expect(order.population).toBe("5000");
    expect(order.silver).toBe("2000");
    expect(order.artifactId).toBe("0");
    expect(order.entryFeeWei).toBe("1000000000000");
    expect(order.materials).toEqual([{ resourceId: 1, amount: "4000" }]);
    expect(order.circuit).toEqual({
      x1: "3",
      y1: "4",
      x2: "6",
      y2: "8",
      r: "100000",
      distMax: "5",
      PLANETHASH_KEY: "1729",
      SPACETYPE_KEY: "1730",
      SCALE: "8192",
      xMirror: "0",
      yMirror: "0",
      targetDistFromOriginSquare: "100",
    });
  });

  it("writes a spacetime-rip material withdrawal in chain units", () => {
    const text = formatWithdrawMaterialOrder({
      planetId: FROM,
      materialType: 1,
      displayAmount: 4,
      entryFeeWei: 1000000000000n,
    });
    const order = JSON.parse(
      text.slice("DARKFOREST_WITHDRAW_MATERIAL\n".length),
    );

    expect(text.startsWith("DARKFOREST_WITHDRAW_MATERIAL\n")).toBe(true);
    expect(order.kind).toBe("darkforest-withdraw-material");
    expect(order.call).toBe("df__withdrawMaterial");
    expect(order.planetHash).toBe("10");
    expect(order.planetHashHex).toBe(FROM);
    expect(order.materialType).toBe(1);
    expect(order.amount).toBe("4000");
    expect(order.entryFeeWei).toBe("1000000000000");
  });

  it("writes a spacetime-rip silver withdrawal in chain units", () => {
    const text = formatWithdrawSilverOrder({
      planetId: FROM,
      displayAmount: 4,
      entryFeeWei: 1000000000000n,
    });
    const order = JSON.parse(text.slice("DARKFOREST_WITHDRAW_SILVER\n".length));

    expect(text.startsWith("DARKFOREST_WITHDRAW_SILVER\n")).toBe(true);
    expect(order.kind).toBe("darkforest-withdraw-silver");
    expect(order.call).toBe("df__withdrawSilver");
    expect(order.planetHash).toBe("10");
    expect(order.planetHashHex).toBe(FROM);
    expect(order.amount).toBe("4000");
    expect(order.entryFeeWei).toBe("1000000000000");
  });

  it("writes a silver purchase with the tier and the token price", () => {
    const text = formatBuySilverOrder({
      planetId: FROM,
      tier: 1,
      priceWhole: 2500,
      priceWei: 2500n * 10n ** 18n,
      silverDisplay: 50,
      paymentToken: "0xd8Aa1F8B035DF250aD349D1928a07fEB3ABAd7a1",
      buySilverSystem: "0x3f8ed9647e0A96038AA0484c777C8625770e8295",
      entryFeeWei: 1000000000000n,
    });
    const order = JSON.parse(text.slice("DARKFOREST_BUY_SILVER\n".length));

    expect(text.startsWith("DARKFOREST_BUY_SILVER\n")).toBe(true);
    expect(order.kind).toBe("darkforest-buy-silver");
    expect(order.call).toBe("df__buySilver");
    expect(order.planetHash).toBe("10");
    expect(order.tier).toBe(1);
    expect(order.priceWhole).toBe("2500");
    expect(order.priceWei).toBe((2500n * 10n ** 18n).toString());
    expect(order.silverDisplay).toBe("50");
    expect(order.paymentToken).toBe(
      "0xd8Aa1F8B035DF250aD349D1928a07fEB3ABAd7a1",
    );
    expect(order.buySilverSystem).toBe(
      "0x3f8ed9647e0A96038AA0484c777C8625770e8295",
    );
  });

  it("writes one range upgrade as an extra level", () => {
    const text = formatUpgradeOrder({
      planetId: FROM,
      rangeTimes: 1,
      speedTimes: 0,
      defenseTimes: 0,
      entryFeeWei: 1000000000000n,
    });
    const order = JSON.parse(text.slice("DARKFOREST_UPGRADE\n".length));

    expect(text.startsWith("DARKFOREST_UPGRADE\n")).toBe(true);
    expect(order.kind).toBe("darkforest-upgrade");
    expect(order.call).toBe("df__upgradePlanet");
    expect(order.planetHash).toBe("10");
    expect(order.rangeTimes).toBe(1);
    expect(order.speedTimes).toBe(0);
    expect(order.defenseTimes).toBe(0);
    expect(order.entryFeeWei).toBe("1000000000000");
  });
});
