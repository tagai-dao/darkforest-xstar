// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import "forge-std/Test.sol";
import { StoreCore } from "@latticexyz/store/src/StoreCore.sol";
import { StoreSwitch } from "@latticexyz/store/src/StoreSwitch.sol";
import { PlanetType, SpaceType, MaterialType, Biome } from "../src/codegen/common.sol";
import { Planet } from "../src/lib/Planet.sol";
import { PlanetLib } from "../src/lib/Planet.sol";
import { PlanetMaterialStorage } from "../src/codegen/tables/PlanetMaterialStorage.sol";
import { PlanetMaterial } from "../src/codegen/tables/PlanetMaterial.sol";
import { PlanetMetadata, PlanetMetadataData } from "../src/codegen/tables/PlanetMetadata.sol";
import { PlanetInitialResource } from "../src/codegen/tables/PlanetInitialResource.sol";
import { InitializeSystem } from "../src/systems/internal/InitializeSystem.sol";

contract AsteroidResourceDefaultsTest is Test, InitializeSystem {
  function setUp() public {
    StoreSwitch.setStoreAddress(address(this));
    StoreCore.initialize();
    PlanetMetadata.register();
    PlanetInitialResource.register();
    PlanetMaterialStorage.register();

    setPlanetMetadata(6, PlanetMetadataData(2838, 160, 200, 300_000_000, 2917, 100_000_000, 2778), 7);
  }

  function testAsteroidSeedAndSharedGrowth() public view {
    PlanetMetadataData memory metadata = PlanetMetadata.get(SpaceType.DEEP_SPACE, PlanetType.ASTEROID_FIELD, 6);
    assertEq(metadata.silverCap, 300_000_000);
    assertEq(metadata.silverGrowth, 416);

    Planet memory asteroid;
    asteroid.planetHash = 1;
    asteroid.planetType = PlanetType.ASTEROID_FIELD;
    asteroid.spaceType = SpaceType.DEEP_SPACE;
    asteroid.level = 6;
    asteroid.silverCap = metadata.silverCap;
    asteroid.silverGrowth = metadata.silverGrowth;
    asteroid.silver = PlanetInitialResource.getSilver(asteroid.spaceType, asteroid.planetType, 6);
    assertEq(asteroid.silver, 15_000_000);

    asteroid.materialStorage.ReadFromStore(asteroid.planetHash);
    asteroid.naturalGrowth(20);
    assertEq(asteroid.silver, 15_000_000);
    assertEq(asteroid.getMaterial(MaterialType.WATER_CRYSTALS), 0);

    asteroid.owner = address(1);
    asteroid.junkOwner = asteroid.owner;
    asteroid.initMaterial(MaterialType.WATER_CRYSTALS);
    assertEq(asteroid.getMaterial(MaterialType.WATER_CRYSTALS), 15_000_000);
    assertEq(asteroid.getMaterialCap(MaterialType.WATER_CRYSTALS), 300_000_000);

    asteroid.naturalGrowth(120);
    assertEq(asteroid.silver, 15_041_600);
    assertEq(asteroid.getMaterial(MaterialType.WATER_CRYSTALS), 15_041_600);
  }

  function testOtherTypesKeepTheirSilverDefaults() public view {
    uint64[5] memory caps = [uint64(150_000_000), 300_000_000, 150_000_000, 300_000_000, 1_500_000_000];
    for (uint8 i = 1; i <= uint8(type(PlanetType).max); i++) {
      PlanetType planetType = PlanetType(i);
      if (planetType == PlanetType.ASTEROID_FIELD) continue;
      PlanetMetadataData memory metadata = PlanetMetadata.get(SpaceType.DEEP_SPACE, planetType, 6);
      assertEq(metadata.silverCap, caps[i - 1]);
      assertEq(metadata.silverGrowth, 0);
      assertEq(PlanetInitialResource.getSilver(SpaceType.DEEP_SPACE, planetType, 6), 0);
    }
  }
}

contract MaterialsTest is Test {
  function testMaterialGrowthLogic() public view {
    // Test the material growth logic directly without relying on world contract
    Planet memory planet;
    planet.planetHash = 1;
    planet.planetType = PlanetType.ASTEROID_FIELD;
    planet.level = 5;
    planet.spaceType = SpaceType.NEBULA;
    planet.perlin = 100;
    planet.silverGrowth = 1000;
    planet.silverCap = 1000000;

    // Test growth calculation
    uint256 growthRate = PlanetLib.getMaterialGrowth(planet, MaterialType.WATER_CRYSTALS);
    uint256 expectedGrowthRate = planet.silverGrowth;
    assertEq(growthRate, expectedGrowthRate);

    // Test material cap calculation
    uint256 materialCap = PlanetLib.getMaterialCap(planet, MaterialType.WATER_CRYSTALS);
    uint256 expectedCap = planet.silverCap;
    assertEq(materialCap, expectedCap);
  }

  function testMaterialGrowthCalculation() public view {
    // Test the material growth calculation for different planet levels
    Planet memory planet;
    planet.planetType = PlanetType.ASTEROID_FIELD;
    planet.silverGrowth = 1000;

    // Test level 1
    planet.level = 1;
    uint256 growthRate1 = PlanetLib.getMaterialGrowth(planet, MaterialType.WATER_CRYSTALS);
    assertEq(growthRate1, planet.silverGrowth);

    // Test level 3
    planet.level = 3;
    uint256 growthRate3 = PlanetLib.getMaterialGrowth(planet, MaterialType.WATER_CRYSTALS);
    assertEq(growthRate3, planet.silverGrowth);

    // Test level 5
    planet.level = 5;
    uint256 growthRate5 = PlanetLib.getMaterialGrowth(planet, MaterialType.WATER_CRYSTALS);
    assertEq(growthRate5, planet.silverGrowth);
  }

  function testMaterialCapCalculation() public pure {
    // Test the material cap calculation for different planet levels
    Planet memory planet;
    planet.planetType = PlanetType.ASTEROID_FIELD;
    planet.silverCap = 1000000;

    // Test level 1
    planet.level = 1;
    uint256 cap1 = PlanetLib.getMaterialCap(planet, MaterialType.WATER_CRYSTALS);
    assertEq(cap1, planet.silverCap);

    // Test level 3
    planet.level = 3;
    uint256 cap3 = PlanetLib.getMaterialCap(planet, MaterialType.WATER_CRYSTALS);
    assertEq(cap3, planet.silverCap);

    // Test level 5
    planet.level = 5;
    uint256 cap5 = PlanetLib.getMaterialCap(planet, MaterialType.WATER_CRYSTALS);
    assertEq(cap5, planet.silverCap);

    // Test level 7
    planet.level = 7;
    uint256 cap7 = PlanetLib.getMaterialCap(planet, MaterialType.WATER_CRYSTALS);
    assertEq(cap7, planet.silverCap);
  }

  function testNonAsteroidFieldPlanet() public view {
    // Test that non-ASTEROID_FIELD planets don't have material growth
    Planet memory planet;
    planet.planetType = PlanetType.PLANET;
    planet.level = 5;

    uint256 growthRate = PlanetLib.getMaterialGrowth(planet, MaterialType.WATER_CRYSTALS);
    assertEq(growthRate, 0); // Non-ASTEROID_FIELD planets should have 0 growth
  }

  function testMaterialStorageOperations() public view {
    // Test material storage operations
    Planet memory planet;
    planet.planetHash = 1;

    // Initialize material storage arrays
    uint256 materialCount = uint8(type(MaterialType).max) + 1;
    planet.materialStorage.exists = new bool[](materialCount);
    planet.materialStorage.updates = new bool[](materialCount);
    planet.materialStorage.amount = new uint256[](materialCount);

    // Test setting and getting materials
    planet.materialStorage.setMaterial(planet.planetHash, MaterialType.WATER_CRYSTALS, 1000);
    uint256 amount = planet.materialStorage.getMaterial(planet.planetHash, MaterialType.WATER_CRYSTALS);
    assertEq(amount, 1000);

    // Test updating material amount
    planet.materialStorage.setMaterial(planet.planetHash, MaterialType.WATER_CRYSTALS, 2000);
    amount = planet.materialStorage.getMaterial(planet.planetHash, MaterialType.WATER_CRYSTALS);
    assertEq(amount, 2000);

    // Test getting non-existent material
    amount = planet.materialStorage.getMaterial(planet.planetHash, MaterialType.LIVING_WOOD);
    assertEq(amount, 0);
  }
}
