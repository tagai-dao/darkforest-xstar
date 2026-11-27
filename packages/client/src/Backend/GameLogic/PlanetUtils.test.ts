import { EMPTY_ADDRESS } from "@df/constants";
import type { Materials, Planet, WorldLocation } from "@df/types";
import { Biome, MaterialType, PlanetType, SpaceType } from "@df/types";
import { describe, expect, it, vi } from "vitest";

import { PlanetUtils } from "./PlanetUtils";

function fixture(addJunkTick = 0) {
  const utils = new PlanetUtils(
    {} as ConstructorParameters<typeof PlanetUtils>[0],
  );
  const location = {
    hash: "1".padStart(64, "0"),
    perlin: 0,
    biomebase: 0,
    coords: { x: 100, y: 100 },
  } as WorldLocation;
  const planet = {
    owner: EMPTY_ADDRESS,
    planetType: PlanetType.SILVER_MINE,
    spaceType: SpaceType.NEBULA,
    planetLevel: 1,
    addJunkTick,
  } as Planet;
  vi.spyOn(utils, "readPlanet").mockReturnValue(planet);
  vi.spyOn(utils, "getBiome").mockReturnValue(Biome.OCEAN);
  const reads = vi
    .spyOn(utils, "_initPopulationAndSilver")
    .mockReturnValue([0, 5_000]);
  return { utils, location, reads };
}

describe("asteroid material inventory", () => {
  it("uses the actual amounts and keeps the registration grant separate", () => {
    const { utils, location, reads } = fixture();
    const materials: Materials[] = [
      {
        materialId: MaterialType.WATER_CRYSTALS,
        materialAmount: 2,
        cap: 100,
        growthRate: 0,
        growth: false,
      },
    ];
    vi.spyOn(utils, "readMaterials").mockReturnValue(materials);

    const planet = utils.defaultPlanetFromLocation(location);

    expect(planet.materials).toEqual(materials);
    expect(planet.materialRegistrationPreview).toEqual([
      { materialId: MaterialType.WATER_CRYSTALS, materialAmount: 5 },
    ]);
    expect(reads).toHaveBeenCalledWith(
      SpaceType.NEBULA,
      PlanetType.SILVER_MINE,
      1,
    );
  });

  it("does not preview a grant again after the first registration", () => {
    const { utils, location, reads } = fixture(20);
    vi.spyOn(utils, "readMaterials").mockReturnValue([]);

    const planet = utils.defaultPlanetFromLocation(location);

    expect(planet.materialRegistrationPreview).toBeUndefined();
    expect(reads).not.toHaveBeenCalled();
  });
});
