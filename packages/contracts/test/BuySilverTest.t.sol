// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import "forge-std/Test.sol";
import { BaseTest } from "./BaseTest.t.sol";
import { IWorld } from "../src/codegen/world/IWorld.sol";
import { Planet as PlanetTable } from "../src/codegen/index.sol";
import { PlanetType, SpaceType } from "../src/codegen/common.sol";
import { Planet } from "../src/lib/Planet.sol";
import { DFXStarConfig } from "../src/codegen/tables/DFXStarConfig.sol";
import { SilverPurchaseConfig } from "../src/codegen/tables/SilverPurchaseConfig.sol";
import { PlanetAddJunkTick } from "../src/codegen/tables/PlanetAddJunkTick.sol";
import { Ticker } from "../src/codegen/tables/Ticker.sol";
import { Errors } from "../src/interfaces/errors.sol";
import { MockDFXStarScoreStaking } from "./mocks/MockDFXStarScoreStaking.sol";
import { MockPaymentToken } from "./mocks/MockPaymentToken.sol";

contract BuySilverTest is BaseTest {
  uint256 planetHash = uint256(keccak256("buy-silver-planet"));
  MockDFXStarScoreStaking pool;
  MockPaymentToken token;

  function setUp() public override {
    super.setUp();

    pool = new MockDFXStarScoreStaking();
    token = new MockPaymentToken();

    vm.startPrank(admin);
    if (Ticker.getPaused()) {
      IWorld(worldAddress).df__unpause();
    }

    uint256[3] memory prices;
    uint256[3] memory silvers;
    prices[0] = 10_000 ether;
    prices[1] = 80_000 ether;
    prices[2] = 600_000 ether;
    silvers[0] = 10_000 * 1000;
    silvers[1] = 100_000 * 1000;
    silvers[2] = 1_000_000 * 1000;
    SilverPurchaseConfig.setTierPrices(prices);
    SilverPurchaseConfig.setTierSilverAmounts(silvers);

    DFXStarConfig.set(address(pool), address(token), address(0), address(0), address(this));

    IWorld(worldAddress).df__createPlanet(
      planetHash,
      user1,
      0,
      5,
      PlanetType.PLANET,
      SpaceType.SPACE,
      100_000_000,
      50_000_000,
      0
    );
    IWorld(worldAddress).df__setPlanetJunkOwner(planetHash, user1, 5);
    PlanetAddJunkTick.set(bytes32(planetHash), 1);
    IWorld(worldAddress).df__registerPlayer("buyer", address(1));
    vm.stopPrank();

    token.mint(user1, 1_000_000 ether);
  }

  function testBuySilver_revertNoStakers() public {
    vm.startPrank(user1);
    token.approve(worldAddress, 10_000 ether);
    vm.expectRevert(Errors.NoStakersForBuySilver.selector);
    IWorld(worldAddress).df__buySilver(planetHash, 0);
    vm.stopPrank();
  }

  function testBuySilver_revertSpacetimeRip() public {
    uint256 ripHash = uint256(keccak256("rip-planet"));
    vm.startPrank(admin);
    IWorld(worldAddress).df__createPlanet(
      ripHash,
      user1,
      0,
      5,
      PlanetType.SPACETIME_RIP,
      SpaceType.SPACE,
      100_000_000,
      50_000_000,
      0
    );
    IWorld(worldAddress).df__setPlanetJunkOwner(ripHash, user1, 5);
    PlanetAddJunkTick.set(bytes32(ripHash), 1);
    vm.stopPrank();

    pool.depositFromGame(user2, 1);

    vm.startPrank(user1);
    token.approve(worldAddress, 10_000 ether);
    vm.expectRevert(Errors.BuySilverOnSpacetimeRip.selector);
    IWorld(worldAddress).df__buySilver(ripHash, 0);
    vm.stopPrank();
  }
}
