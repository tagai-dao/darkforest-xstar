// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import { IBaseWorld } from "@latticexyz/world/src/codegen/interfaces/IBaseWorld.sol";

import { BaseTest } from "./BaseTest.t.sol";
import { IWorld } from "../src/codegen/world/IWorld.sol";
import { PlanetType, SpaceType } from "../src/codegen/common.sol";
import { DFXStarConfig } from "../src/codegen/tables/DFXStarConfig.sol";
import { Ticker } from "../src/codegen/tables/Ticker.sol";
import { Errors } from "../src/interfaces/errors.sol";
import { StakeScoreSystem } from "../src/systems/StakeScoreSystem.sol";
import { DFXStarStakingLib } from "../src/lib/DFXStarStakingLib.sol";
import { MockDFXStarScoreStaking } from "./mocks/MockDFXStarScoreStaking.sol";

/// @notice Ensures withdraw passes score delta (not cumulative) to depositFromGame.
contract WithdrawStakeDeltaTest is BaseTest {
  uint256 planetHash = type(uint256).max;
  MockDFXStarScoreStaking pool;

  function setUp() public override {
    super.setUp();
    pool = new MockDFXStarScoreStaking(worldAddress);

    vm.startPrank(admin);
    if (Ticker.getPaused()) {
      IWorld(worldAddress).df__unpause();
    }
    DFXStarConfig.set(address(pool), address(0), address(0), address(0), address(0));
    IWorld(worldAddress).df__createPlanet(
      planetHash,
      user1,
      0,
      9,
      PlanetType.SPACETIME_RIP,
      SpaceType.SPACE,
      800_000_000,
      800_000_000,
      0
    );
    vm.stopPrank();
  }

  function testWithdrawSilver_stakesDelta() public {
    uint256 withdrawAmount = 300_000_000;
    vm.prank(user1);
    IWorld(worldAddress).df__withdrawSilver(planetHash, withdrawAmount);

    assertEq(pool.lastDepositSender(), worldAddress);
    assertEq(pool.lastDepositUser(), user1);
    assertEq(pool.lastDepositAmount(), withdrawAmount);
    assertEq(pool.totalStaked(), withdrawAmount);
  }

  function testStake_rejectsPlayer() public {
    vm.prank(user1);
    vm.expectRevert(Errors.NotScoreStakeCaller.selector);
    IBaseWorld(worldAddress).call(
      DFXStarStakingLib.stakeScoreSystemId(),
      abi.encodeCall(StakeScoreSystem.stake, (user1, 1))
    );
  }
}
