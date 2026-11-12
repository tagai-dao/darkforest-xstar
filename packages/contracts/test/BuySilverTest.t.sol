// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import "forge-std/Test.sol";
import { Systems } from "@latticexyz/world/src/codegen/tables/Systems.sol";
import { WorldResourceIdLib } from "@latticexyz/world/src/WorldResourceId.sol";
import { BaseTest } from "./BaseTest.t.sol";
import { IWorld } from "../src/codegen/world/IWorld.sol";
import { Planet as PlanetTable } from "../src/codegen/index.sol";
import { PlanetType, SpaceType } from "../src/codegen/common.sol";
import { DFXStarConfig } from "../src/codegen/tables/DFXStarConfig.sol";
import { SilverFrontier } from "../src/codegen/tables/SilverFrontier.sol";
import { SilverPurchaseConfig } from "../src/codegen/tables/SilverPurchaseConfig.sol";
import { PlanetAddJunkTick } from "../src/codegen/tables/PlanetAddJunkTick.sol";
import { Ticker } from "../src/codegen/tables/Ticker.sol";
import { Errors } from "../src/interfaces/errors.sol";
import { MockDFXStarScoreStaking } from "./mocks/MockDFXStarScoreStaking.sol";
import { MockPaymentToken } from "./mocks/MockPaymentToken.sol";

contract BuySilverTest is BaseTest {
  MockDFXStarScoreStaking pool;
  MockPaymentToken token;

  function setUp() public override {
    super.setUp();

    pool = new MockDFXStarScoreStaking(worldAddress);
    token = new MockPaymentToken();

    vm.startPrank(admin);
    if (Ticker.getPaused()) {
      IWorld(worldAddress).df__unpause();
    }

    // 旧三档表即使写成别的数，也不再参与计价。
    uint256[3] memory prices;
    uint256[3] memory silvers;
    prices[0] = 1;
    prices[1] = 1;
    prices[2] = 1;
    silvers[0] = 1;
    silvers[1] = 1;
    silvers[2] = 1;
    SilverPurchaseConfig.setTierPrices(prices);
    SilverPurchaseConfig.setTierSilverAmounts(silvers);

    DFXStarConfig.set(address(pool), address(token), address(0), address(0), address(this));
    vm.stopPrank();

    // 登记的是调用者，不是第二个参数。第二个参数只是 burner。
    vm.prank(user1);
    IWorld(worldAddress).df__registerPlayer("buyer", user1);

    token.mint(user1, 1_000_000 ether);
  }

  function testBuySilver_revertNoStakers() public {
    uint256 planetHash = _ownPlanet("no-stakers", 5, PlanetType.PLANET, SpaceType.SPACE, 0);

    vm.startPrank(user1);
    token.approve(_buySilverSystem(), 34_000 ether);
    vm.expectRevert(Errors.NoStakersForBuySilver.selector);
    IWorld(worldAddress).df__buySilver(planetHash, 0);
    vm.stopPrank();
  }

  function testBuySilver_revertSpacetimeRip() public {
    uint256 ripHash = _ownPlanet("rip", 5, PlanetType.SPACETIME_RIP, SpaceType.SPACE, 0);
    pool.depositFromGame(user2, 1);

    vm.startPrank(user1);
    token.approve(_buySilverSystem(), 34_000 ether);
    vm.expectRevert(Errors.BuySilverOnSpacetimeRip.selector);
    IWorld(worldAddress).df__buySilver(ripHash, 0);
    vm.stopPrank();
  }

  function testBuySilver_levelZeroRejectedAndDoesNotAdvanceFrontier() public {
    uint256 home = _ownPlanet("home", 0, PlanetType.PLANET, SpaceType.NEBULA, 0);
    assertEq(SilverFrontier.getLevel(), 0);

    pool.depositFromGame(user2, 1);
    vm.startPrank(user1);
    token.approve(_buySilverSystem(), 1_000 ether);
    vm.expectRevert(Errors.InvalidSilverPurchaseLevel.selector);
    IWorld(worldAddress).df__buySilver(home, 0);
    vm.stopPrank();
  }

  function testBuySilver_frontierOnlyMovesUp() public {
    _ownPlanet("low", 2, PlanetType.PLANET, SpaceType.NEBULA, 0);
    assertEq(SilverFrontier.getLevel(), 2);

    _ownPlanet("high", 6, PlanetType.PLANET, SpaceType.SPACE, 0);
    assertEq(SilverFrontier.getLevel(), 6);

    _ownPlanet("abandoned-looking", 3, PlanetType.PLANET, SpaceType.NEBULA, 0);
    assertEq(SilverFrontier.getLevel(), 6);
  }

  function testBuySilver_levelFiveTwentiethAtFullPrice() public {
    uint256 planetHash = _ownPlanet("l5", 5, PlanetType.PLANET, SpaceType.NEBULA, 0);
    assertEq(SilverFrontier.getLevel(), 5);
    pool.depositFromGame(user2, 1);

    vm.startPrank(user1);
    token.approve(_buySilverSystem(), type(uint256).max);
    IWorld(worldAddress).df__buySilver(planetHash, 0);
    vm.stopPrank();

    assertEq(pool.lastInjectAmount(), 34_000 ether);
    assertEq(token.balanceOf(user1), 1_000_000 ether - 34_000 ether);
    // 5 级 20% 是页面上的 10000 银，链上再乘 1000。
    assertEq(PlanetTable.getSilver(bytes32(planetHash)), 10_000_000);
  }

  function testBuySilver_quasarPaysTheSamePack() public {
    uint256 planetHash = _ownPlanet("quasar", 5, PlanetType.QUASAR, SpaceType.SPACE, 0);
    pool.depositFromGame(user2, 1);

    vm.startPrank(user1);
    token.approve(_buySilverSystem(), type(uint256).max);
    IWorld(worldAddress).df__buySilver(planetHash, 0);
    vm.stopPrank();

    assertEq(pool.lastInjectAmount(), 34_000 ether);
    assertEq(PlanetTable.getSilver(bytes32(planetHash)), 10_000_000);
  }

  function testBuySilver_lowerLevelIsDiscountedAndHalfTokenRoundsUp() public {
    _ownPlanet("frontier", 4, PlanetType.PLANET, SpaceType.NEBULA, 0);
    uint256 planetHash = _ownPlanet("l3", 3, PlanetType.PLANET, SpaceType.NEBULA, 0);
    pool.depositFromGame(user2, 1);

    vm.startPrank(user1);
    token.approve(_buySilverSystem(), type(uint256).max);
    IWorld(worldAddress).df__buySilver(planetHash, 1);
    vm.stopPrank();

    // 进度 4、星球 3，价格 90%。15625 × 90% = 14062.5，进一成 14063。
    assertEq(pool.lastInjectAmount(), 14_063 ether);
    assertEq(PlanetTable.getSilver(bytes32(planetHash)), 1_250_000);
  }

  function testBuySilver_deepSpaceHoldsOneHundredFiftyPercent() public {
    uint256 planetHash = _ownPlanet("deep", 5, PlanetType.PLANET, SpaceType.DEEP_SPACE, 0);
    pool.depositFromGame(user2, 1);

    vm.startPrank(user1);
    token.approve(_buySilverSystem(), type(uint256).max);
    IWorld(worldAddress).df__buySilver(planetHash, 3);
    vm.stopPrank();

    assertEq(pool.lastInjectAmount(), 255_000 ether);
    assertEq(PlanetTable.getSilver(bytes32(planetHash)), 75_000_000);
  }

  function testBuySilver_nebulaCannotHoldOneHundredFiftyPercent() public {
    uint256 planetHash = _ownPlanet("nebula", 5, PlanetType.PLANET, SpaceType.NEBULA, 0);
    pool.depositFromGame(user2, 1);

    vm.startPrank(user1);
    token.approve(_buySilverSystem(), type(uint256).max);
    vm.expectRevert(Errors.InsufficientPlanetSilverCapacity.selector);
    IWorld(worldAddress).df__buySilver(planetHash, 3);
    vm.stopPrank();
  }

  function testBuySilver_rejectsUnknownTier() public {
    uint256 planetHash = _ownPlanet("tier", 5, PlanetType.PLANET, SpaceType.NEBULA, 0);
    pool.depositFromGame(user2, 1);

    vm.startPrank(user1);
    token.approve(_buySilverSystem(), type(uint256).max);
    vm.expectRevert(Errors.InvalidSilverPurchaseTier.selector);
    IWorld(worldAddress).df__buySilver(planetHash, 4);
    vm.stopPrank();
  }

  function _buySilverSystem() internal view returns (address) {
    return Systems.getSystem(WorldResourceIdLib.encode("sy", "df", "BuySilverSystem"));
  }

  function _ownPlanet(
    string memory label,
    uint8 level,
    PlanetType planetType,
    SpaceType spaceType,
    uint64 silver
  ) internal returns (uint256 planetHash) {
    planetHash = uint256(keccak256(bytes(label)));
    vm.startPrank(admin);
    IWorld(worldAddress).df__createPlanet(planetHash, user1, 0, level, planetType, spaceType, 100_000_000, silver, 0);
    IWorld(worldAddress).df__setPlanetJunkOwner(planetHash, user1, level);
    PlanetAddJunkTick.set(bytes32(planetHash), 1);
    vm.stopPrank();
  }
}
