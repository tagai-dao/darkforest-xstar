import type { ArtifactId, LocationId } from "@df/types";
import { describe, expect, it } from "vitest";

import {
  buildMoveOrder,
  formatAddJunkOrder,
  formatBuySilverOrder,
  formatClaimCommunityOrder,
  formatClaimRewardsOrder,
  formatClearJunkOrder,
  formatFindArtifactOrder,
  formatRevertMoveOrder,
  formatUpgradeOrder,
  formatUseArtifactOrder,
  formatWithdrawMaterialOrder,
  formatWithdrawSilverOrder,
  revertStillInFirstHalf,
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

  it("writes a claim for the injected AIPRO on the score pool", () => {
    const text = formatClaimRewardsOrder({
      pool: "0xaaF713E1F8478318288836FDeACe0AC28d9316D3",
      pendingWei: 8888n * 10n ** 18n,
    });
    const order = JSON.parse(text.slice("DARKFOREST_CLAIM_REWARDS\n".length));

    expect(text.startsWith("DARKFOREST_CLAIM_REWARDS\n")).toBe(true);
    expect(order.kind).toBe("darkforest-claim-rewards");
    expect(order.call).toBe("claimExternalRewards");
    expect(order.pool).toBe("0xaaF713E1F8478318288836FDeACe0AC28d9316D3");
    expect(order.pendingWei).toBe((8888n * 10n ** 18n).toString());
    expect(order.valueWei).toBe("0");
  });

  it("writes a community claim against the score pool", () => {
    const text = formatClaimCommunityOrder({
      community: "0x06AA8A7AEDb0359074388dA43e5D51D62496DBb7",
      pool: "0xaaF713E1F8478318288836FDeACe0AC28d9316D3",
      pendingWei: 59524n * 10n ** 18n,
    });
    const order = JSON.parse(text.slice("DARKFOREST_CLAIM_COMMUNITY\n".length));

    expect(text.startsWith("DARKFOREST_CLAIM_COMMUNITY\n")).toBe(true);
    expect(order.kind).toBe("darkforest-claim-community");
    expect(order.call).toBe("withdrawPoolsRewards");
    expect(order.community).toBe("0x06AA8A7AEDb0359074388dA43e5D51D62496DBb7");
    expect(order.pool).toBe("0xaaF713E1F8478318288836FDeACe0AC28d9316D3");
    expect(order.pendingWei).toBe((59524n * 10n ** 18n).toString());
    expect(order.valueWei).toBe("0");
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

  it("writes a junk registration with the biomebase circuit", () => {
    const text = formatAddJunkOrder({
      planetId: FROM,
      x: 3,
      y: 4,
      biomebase: 16,
      planetHashKey: 1729,
      biomebaseKey: 1731,
      scale: 8192,
      mirrorX: false,
      mirrorY: false,
      entryFeeWei: 1000000000000n,
    });
    const order = JSON.parse(text.slice("DARKFOREST_ADD_JUNK\n".length));

    expect(text.startsWith("DARKFOREST_ADD_JUNK\n")).toBe(true);
    expect(order.kind).toBe("darkforest-add-junk");
    expect(order.call).toBe("df__addJunk");
    expect(order.planetHash).toBe("10");
    expect(order.biomebase).toBe("16");
    expect(order.circuit).toMatchObject({
      x: "3",
      y: "4",
      PLANETHASH_KEY: "1729",
      BIOMEBASE_KEY: "1731",
      SCALE: "8192",
      xMirror: "0",
      yMirror: "0",
    });
  });

  it("writes an artifact order with the biomebase circuit and the phase", () => {
    const text = formatFindArtifactOrder({
      planetId: FROM,
      x: 3,
      y: 4,
      biomebase: 16,
      planetHashKey: 1729,
      biomebaseKey: 1731,
      scale: 8192,
      mirrorX: false,
      mirrorY: true,
      phase: "prospect-then-find",
      entryFeeWei: 1000000000000n,
    });
    const order = JSON.parse(text.slice("DARKFOREST_FIND_ARTIFACT\n".length));

    expect(text.startsWith("DARKFOREST_FIND_ARTIFACT\n")).toBe(true);
    expect(order.kind).toBe("darkforest-find-artifact");
    expect(order.call).toBe("df__findingArtifact");
    expect(order.prospectCall).toBe("df__prospectPlanet");
    expect(order.phase).toBe("prospect-then-find");
    expect(order.planetHash).toBe("10");
    expect(order.biomebase).toBe("16");
    expect(order.circuit).toMatchObject({
      x: "3",
      y: "4",
      yMirror: "1",
    });
  });

  it("writes a wormhole activation and a pink-bomb landing", () => {
    const artifactId =
      "0000000000000000000000000000000000000000000000000000000000000009" as ArtifactId;
    const wormhole = formatUseArtifactOrder({
      action: "activate",
      planetId: FROM,
      artifactId,
      dataKind: "wormhole",
      target: { id: TO, x: 6, y: 8 },
      planetHashKey: 1729,
      spaceTypeKey: 1730,
      scale: 8192,
      mirrorX: false,
      mirrorY: true,
      entryFeeWei: 1000000000000n,
    });
    const linked = JSON.parse(
      wormhole.slice("DARKFOREST_USE_ARTIFACT\n".length),
    );

    expect(wormhole.startsWith("DARKFOREST_USE_ARTIFACT\n")).toBe(true);
    expect(linked.kind).toBe("darkforest-use-artifact");
    expect(linked.call).toBe("df__activateArtifact");
    expect(linked.dataKind).toBe("wormhole");
    expect(linked.artifactId).toBe("9");
    expect(linked.targetHash).toBe("11");
    expect(linked.valueWei).toBe("1000000000000");
    expect(linked.circuit).toBeUndefined();

    const landing = formatUseArtifactOrder({
      action: "land",
      planetId: FROM,
      artifactId,
      dataKind: "reveal",
      target: { id: TO, x: 6, y: 8 },
      planetHashKey: 1729,
      spaceTypeKey: 1730,
      scale: 8192,
      mirrorX: false,
      mirrorY: false,
      entryFeeWei: 1000000000000n,
    });
    const bomb = JSON.parse(landing.slice("DARKFOREST_USE_ARTIFACT\n".length));

    expect(bomb.call).toBe("destroy");
    expect(bomb.namespace).toBe("atf.1");
    expect(bomb.system).toBe("ProxySystem");
    expect(bomb.valueWei).toBe("0");
    expect(bomb.revealPlanetHash).toBe("11");
    expect(bomb.circuit).toMatchObject({
      x: "6",
      y: "8",
      PLANETHASH_KEY: "1729",
      SPACETYPE_KEY: "1730",
      yMirror: "0",
    });
  });

  it("writes a recall for the destination the fleet is flying toward", () => {
    const text = formatRevertMoveOrder({
      moveId: "42",
      toPlanetId: TO,
      entryFeeWei: 1000000000000n,
    });
    const order = JSON.parse(text.slice("DARKFOREST_REVERT_MOVE\n".length));

    expect(text.startsWith("DARKFOREST_REVERT_MOVE\n")).toBe(true);
    expect(order.kind).toBe("darkforest-revert-move");
    expect(order.call).toBe("df__revertMove");
    expect(order.moveId).toBe("42");
    expect(order.toPlanetHash).toBe("11");
    expect(order.entryFeeWei).toBe("1000000000000");
    expect(revertStillInFirstHalf(0, 100, 49)).toBe(true);
    expect(revertStillInFirstHalf(0, 100, 50)).toBe(false);
  });

  it("writes a junk clear and whether the planet is also owned", () => {
    const text = formatClearJunkOrder({
      planetId: FROM,
      ownsPlanet: true,
      entryFeeWei: 1000000000000n,
    });
    const order = JSON.parse(text.slice("DARKFOREST_CLEAR_JUNK\n".length));

    expect(text.startsWith("DARKFOREST_CLEAR_JUNK\n")).toBe(true);
    expect(order.kind).toBe("darkforest-clear-junk");
    expect(order.call).toBe("df__clearJunk");
    expect(order.planetHash).toBe("10");
    expect(order.ownsPlanet).toBe(true);
    expect(order.entryFeeWei).toBe("1000000000000");
  });
});
