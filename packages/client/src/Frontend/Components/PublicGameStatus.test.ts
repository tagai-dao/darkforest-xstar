import type { Artifact, Planet } from "@df/types";
import { describe, expect, it } from "vitest";

import {
  artifactLevelFits,
  artifactProgress,
  artifactUseChoices,
  collectOwnedArtifacts,
  ownedArtifactName,
  ownedArtifactRarity,
} from "./ownedArtifacts";

const planet = {
  heldArtifactIds: ["9"],
  location: { coords: { x: 92975, y: -12487 } },
} as unknown as Planet;

const wormhole = {
  id: "9",
  artifactIndex: 5,
  artifactType: 5,
  rarity: 2,
  currentOwner: "0xabc",
  controller: "0xabc",
  onPlanetId: "planet",
} as unknown as Artifact;

describe("owned artifacts", () => {
  it("names the four installed artifacts in Chinese", () => {
    expect(ownedArtifactName(1, 0)).toBe("粉红炸弹");
    expect(ownedArtifactName(4, 0)).toBe("布隆过滤器");
    expect(ownedArtifactName(5, 0)).toBe("虫洞");
    expect(ownedArtifactName(6, 0)).toBe("火炮");
    expect(ownedArtifactRarity(2)).toBe("稀有");
  });

  it("lists a foundry artifact once, under its coordinates", () => {
    const lines = collectOwnedArtifacts(
      [planet],
      () => wormhole,
      [wormhole],
      () => undefined,
      "0xabc",
    );
    expect(lines).toEqual([
      {
        id: "9",
        name: "虫洞",
        rarity: "稀有",
        place: "(92,975, -12,487)",
      },
    ]);
  });

  it("keeps a wallet artifact and skips someone else's", () => {
    const mine = {
      ...wormhole,
      id: "3",
      onPlanetId: undefined,
    } as unknown as Artifact;
    const theirs = {
      ...wormhole,
      id: "4",
      currentOwner: "0xother",
      controller: "0xother",
      onPlanetId: undefined,
    } as unknown as Artifact;
    const lines = collectOwnedArtifacts(
      [],
      () => undefined,
      [mine, theirs],
      () => undefined,
      "0xabc",
    );
    expect(lines.map((line) => line.place)).toEqual(["在钱包"]);
    expect(lines.map((line) => line.id)).toEqual(["3"]);
  });

  it("keeps each artifact inside its level window", () => {
    expect(
      artifactLevelFits({ artifactIndex: 4, rarity: 1, reqLevel: 0x0300 }, 0),
    ).toBe(true);
    expect(
      artifactLevelFits({ artifactIndex: 4, rarity: 1, reqLevel: 0x0300 }, 3),
    ).toBe(false);
    expect(
      artifactLevelFits({ artifactIndex: 1, rarity: 1, reqLevel: 0x0504 }, 4),
    ).toBe(true);
    expect(
      artifactLevelFits({ artifactIndex: 1, rarity: 1, reqLevel: 0x0504 }, 5),
    ).toBe(false);
    expect(
      artifactLevelFits({ artifactIndex: 6, rarity: 5, reqLevel: 0 }, 9),
    ).toBe(true);
  });

  it("fills the charge bar, then the flight bar", () => {
    const charging = artifactProgress(
      { status: 2, chargeTick: 1000, charge: 14400 },
      1000 + 7200,
    );
    expect(charging?.label).toBe("充能");
    expect(charging?.ratio).toBeCloseTo(0.5);
    expect(charging?.remainingTicks).toBe(7200);

    const cooling = artifactProgress(
      { status: 1, cooldownTick: 50, cooldown: 100 },
      80,
    );
    expect(cooling?.label).toBe("冷却");
    expect(cooling?.ratio).toBeCloseTo(0.3);

    const flight = artifactProgress({ status: 5 }, 150, {
      departureTick: 100,
      arrivalTick: 200,
    });
    expect(flight?.label).toBe("激活");
    expect(flight?.ratio).toBeCloseTo(0.5);

    const window = artifactProgress({ status: 5 }, 250, {
      departureTick: 100,
      arrivalTick: 200,
    });
    expect(window?.label).toBe("摧毁窗口");
    expect(window?.remainingTicks).toBe(250);

    expect(
      artifactProgress({ status: 0, charge: 14400 }, 1000),
    ).toBeUndefined();
  });

  it("offers charge, activate, and landing from the artifact status", () => {
    expect(
      artifactUseChoices({ artifactIndex: 6, status: 0 }).map(
        (choice) => choice.action,
      ),
    ).toEqual(["charge"]);
    expect(
      artifactUseChoices({ artifactIndex: 5, status: 0 }).map(
        (choice) => choice.action,
      ),
    ).toEqual(["activate"]);
    expect(
      artifactUseChoices({ artifactIndex: 1, status: 3 }).map(
        (choice) => choice.action,
      ),
    ).toEqual(["activate", "shutdown", "land"]);
    expect(artifactUseChoices({ artifactIndex: 4, status: 5 })).toEqual([]);
  });
});
