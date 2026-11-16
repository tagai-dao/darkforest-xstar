// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import { Systems } from "@latticexyz/world/src/codegen/tables/Systems.sol";
import { WorldResourceIdLib } from "@latticexyz/world/src/WorldResourceId.sol";
import { BaseTest } from "./BaseTest.t.sol";
import { IWorld } from "../src/codegen/world/IWorld.sol";
import { PlanetType, SpaceType } from "../src/codegen/common.sol";
import { DFXStarConfig } from "../src/codegen/tables/DFXStarConfig.sol";
import { SilverPurchaseConfig } from "../src/codegen/tables/SilverPurchaseConfig.sol";
import { PlanetAddJunkTick } from "../src/codegen/tables/PlanetAddJunkTick.sol";
import { Planet } from "../src/codegen/tables/Planet.sol";
import { Ticker } from "../src/codegen/tables/Ticker.sol";
import { Committee } from "nutbox/Committee.sol";
import { CommunityFactory } from "nutbox/CommunityFactory.sol";
import { Community } from "nutbox/Community.sol";
import { LinearTimeCalculator } from "nutbox/calculators/LinearTimeCalculator.sol";
import { DFXStarScoreStakingFactory } from "nutbox/dapps/dfxstar-score-staking/DFXStarScoreStakingFactory.sol";
import { DFXStarScoreStaking } from "nutbox/dapps/dfxstar-score-staking/DFXStarScoreStaking.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { Errors } from "../src/interfaces/errors.sol";

/// @dev Simple ERC20 for testing (non-mintable, pre-minted supply).
contract TestDFS is ERC20 {
  constructor(string memory name_, string memory symbol_, uint256 supply) ERC20(name_, symbol_) {
    _mint(msg.sender, supply);
  }
}

/// @notice E2E flow with real Nutbox contracts: Committee → Community → DFXStarPool → withdraw → buySilver
contract E2E_DFStar_Flow is BaseTest {
  uint256 ripHash = uint256(keccak256("rip-planet"));
  uint256 planetHash = uint256(keccak256("buy-silver-planet"));

  // Nutbox contracts
  Committee committee;
  CommunityFactory communityFactory;
  LinearTimeCalculator calculator;
  DFXStarScoreStakingFactory dfxFactory;
  Community community;
  DFXStarScoreStaking pool;
  TestDFS dfsToken;

  function setUp() public override {
    super.setUp();

    // ─── Deploy Nutbox stack ───

    // 1. Committee (all fees = 0)
    committee = new Committee(payable(admin));
    vm.startPrank(admin);
    committee.adminSetCreateCommunityFee(0);
    committee.adminSetCommunitySettingsFee(0);
    committee.adminSetPoolOperationFee(0);
    vm.stopPrank();

    // 2. CommunityFactory
    communityFactory = new CommunityFactory(address(committee));

    // 3. LinearTimeCalculator + whitelist
    calculator = new LinearTimeCalculator(address(communityFactory));
    vm.prank(admin);
    committee.adminAddContract(address(calculator));

    // 4. DFXStarScoreStakingFactory + whitelist
    dfxFactory = new DFXStarScoreStakingFactory(address(communityFactory));
    vm.prank(admin);
    committee.adminAddContract(address(dfxFactory));

    // 5. Deploy DFS token (non-mintable, 1B supply to admin)
    dfsToken = new TestDFS("DFS", "DFS", 1_000_000_000 ether);

    // 6. Create DFS community with existing token
    //    policy: 1 era, start=now+10, stop=now+365d, amount=1000/s
    bytes memory policy = _encodePolicy(block.timestamp + 10, block.timestamp + 10 + 365 days, 1000);
    address communityAddr = communityFactory.createCommunity(
      false, // isMintable (existing token, not mintable)
      address(dfsToken), // use our TestDFS
      address(0), // no token factory needed
      bytes(""), // no token meta
      address(calculator),
      policy
    );
    community = Community(payable(communityAddr));

    // 7. Create DFXStar pool (100% ratio)
    uint16[] memory ratios = new uint16[](1);
    ratios[0] = 10000;
    community.adminAddPool("DFXStar Score Staking", ratios, address(dfxFactory), abi.encode(worldAddress));

    // 8. Get pool address
    pool = DFXStarScoreStaking(payable(community.activedPools(0)));

    // 10. Configure DFXStarConfig in the World
    vm.startPrank(admin);
    if (Ticker.getPaused()) {
      IWorld(worldAddress).df__unpause();
    }
    DFXStarConfig.set(address(pool), address(dfsToken), address(dfxFactory), communityAddr, address(this));

    // 11. Configure SilverPurchaseConfig
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

    // 12. Create SPACETIME_RIP for withdraw
    IWorld(worldAddress).df__createPlanet(
      ripHash,
      user1,
      0,
      5,
      PlanetType.SPACETIME_RIP,
      SpaceType.SPACE,
      800_000_000,
      800_000_000,
      0
    );
    IWorld(worldAddress).df__setPlanetJunkOwner(ripHash, user1, 5);
    PlanetAddJunkTick.set(bytes32(ripHash), 1);

    // 13. Create regular PLANET for buySilver
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

    vm.stopPrank();

    // 登记的是调用者。购银和提现都由 user1 发起。
    vm.prank(user1);
    IWorld(worldAddress).df__registerPlayer("e2e-player", user1);

    // 15. Transfer DFS tokens to user for buySilver
    dfsToken.transfer(user1, 10_000_000 ether);
  }

  // ─── Test: Committee whitelist is correct ───

  function test_committeeWhitelist() public view {
    assertTrue(committee.verifyContract(address(calculator)), "calculator not whitelisted");
    assertTrue(committee.verifyContract(address(dfxFactory)), "dfxFactory not whitelisted");
  }

  // ─── Test: Pool is correctly wired ───

  function test_poolWiring() public view {
    assertEq(pool.community(), communityAddr(), "pool.community mismatch");
    assertEq(pool.factory(), address(dfxFactory), "pool.factory mismatch");
    assertEq(pool.world(), worldAddress, "pool.world mismatch");
    assertEq(dfxFactory.poolOfWorld(worldAddress), address(pool), "factory binding mismatch");
    assertEq(pool.getTotalStakedAmount(), 0, "initial totalStaked should be 0");
  }

  // ─── Test: Withdraw silver → depositFromGame on real pool ───

  function test_withdrawSilver_depositsToRealPool() public {
    uint256 withdrawAmount = 300_000_000;

    vm.prank(user1);
    IWorld(worldAddress).df__withdrawSilver(ripHash, withdrawAmount);

    // Verify real pool state
    assertEq(pool.getUserStakedAmount(user1), withdrawAmount, "user staked amount mismatch");
    assertEq(pool.getTotalStakedAmount(), withdrawAmount, "total staked mismatch");
  }

  // ─── Test: Buy silver injects rewards to real pool ───

  function test_buySilver_injectsRewardsToRealPool() public {
    // Step 1: Withdraw to seed totalStaked > 0
    vm.prank(user1);
    IWorld(worldAddress).df__withdrawSilver(ripHash, 300_000_000);

    uint256 userBalBefore = dfsToken.balanceOf(user1);

    // 5 级 20% 原价 34000。这颗星和裂隙都是 5 级，进度不再打折。
    vm.startPrank(user1);
    dfsToken.approve(_buySilverSystem(), 34_000 ether);
    IWorld(worldAddress).df__buySilver(planetHash, 0);
    vm.stopPrank();

    uint256 userBalAfter = dfsToken.balanceOf(user1);
    assertEq(userBalBefore - userBalAfter, 34_000 ether, "user should pay 34,000 DFS");
    assertEq(dfsToken.balanceOf(address(pool)), 34_000 ether, "pool should hold injected DFS");
  }

  // ─── Test: Buy silver reverts without stakers ───

  function test_buySilver_revertNoStakers() public {
    vm.startPrank(user1);
    dfsToken.approve(_buySilverSystem(), 10_000 ether);
    vm.expectRevert(Errors.NoStakersForBuySilver.selector);
    IWorld(worldAddress).df__buySilver(planetHash, 0);
    vm.stopPrank();
  }

  // ─── Test: Full flow withdraw → buySilver → claimRewards ───

  function test_fullFlow_withdraw_buySilver_claimRewards() public {
    // Step 1: user1 withdraws → stakes in pool
    vm.prank(user1);
    IWorld(worldAddress).df__withdrawSilver(ripHash, 300_000_000);
    assertEq(pool.getUserStakedAmount(user1), 300_000_000, "user1 staked");

    // Step 2: user1 buys silver → injects rewards
    vm.startPrank(user1);
    dfsToken.approve(_buySilverSystem(), 34_000 ether);
    IWorld(worldAddress).df__buySilver(planetHash, 0);
    vm.stopPrank();

    // Step 3: user1 claims external rewards
    uint256 balBefore = dfsToken.balanceOf(user1);
    vm.prank(user1);
    pool.claimExternalRewards();
    uint256 balAfter = dfsToken.balanceOf(user1);

    // 份额累加用整数除法，这个质押量下会少 1 wei。
    assertEq(balAfter - balBefore, 34_000 ether - 1, "user1 should claim the injected rewards");
    assertEq(pool.getPendingExternalRewards(user1), 0, "no pending after claim");
  }

  // ─── Test: Multi-tier buySilver ───

  function test_buySilver_allTiers() public {
    // Seed stakers
    vm.prank(user1);
    IWorld(worldAddress).df__withdrawSilver(ripHash, 300_000_000);

    // 这颗太空 5 级行星已有 50000 页面银，上限 62500，只剩 20% 这一档放得下。
    vm.startPrank(user1);
    dfsToken.approve(_buySilverSystem(), type(uint256).max);
    IWorld(worldAddress).df__buySilver(planetHash, 0);
    vm.stopPrank();

    assertEq(dfsToken.balanceOf(address(pool)), 34_000 ether, "pool should hold the 20% pack");
  }

  function test_secondPoolSameWorldReverts() public {
    uint16[] memory ratios = new uint16[](2);
    ratios[0] = 10000;
    ratios[1] = 0;
    vm.expectRevert("World already bound");
    community.adminAddPool("Again", ratios, address(dfxFactory), abi.encode(worldAddress));
  }

  function test_depositRejectsNonWorld() public {
    vm.prank(user1);
    vm.expectRevert("Not world");
    pool.depositFromGame(user1, 1);
  }

  function test_setConfig_rejectsAnotherLivePool() public {
    vm.prank(admin);
    vm.expectRevert(Errors.ScorePoolAlreadyBound.selector);
    IWorld(worldAddress).df__setDFXStarConfig(
      address(1),
      address(dfsToken),
      address(dfxFactory),
      address(community),
      worldAddress
    );
  }

  function test_setConfig_rejectsForeignWorld() public {
    uint16[] memory ratios = new uint16[](2);
    ratios[0] = 10000;
    ratios[1] = 0;
    community.adminAddPool("Other", ratios, address(dfxFactory), abi.encode(user2));
    address other = community.activedPools(1);

    vm.startPrank(admin);
    DFXStarConfig.set(address(0), address(dfsToken), address(dfxFactory), address(community), worldAddress);
    vm.expectRevert(Errors.ScorePoolWorldMismatch.selector);
    IWorld(worldAddress).df__setDFXStarConfig(
      other,
      address(dfsToken),
      address(dfxFactory),
      address(community),
      worldAddress
    );
    vm.stopPrank();
  }

  function test_setConfig_acceptsBoundPoolOnce() public {
    vm.startPrank(admin);
    DFXStarConfig.set(address(0), address(0), address(0), address(0), address(0));
    IWorld(worldAddress).df__setDFXStarConfig(
      address(pool),
      address(dfsToken),
      address(dfxFactory),
      address(community),
      worldAddress
    );
    vm.stopPrank();
    assertEq(DFXStarConfig.getScoreStakingPool(), address(pool));
  }

  // ─── Helpers ───

  function _buySilverSystem() internal view returns (address) {
    return Systems.getSystem(WorldResourceIdLib.encode("sy", "df", "BuySilverSystem"));
  }

  function communityAddr() internal view returns (address) {
    return address(community);
  }

  function _encodePolicy(uint256 start, uint256 stop, uint256 amount) internal pure returns (bytes memory) {
    bytes memory policy = new bytes(97);
    policy[0] = bytes1(uint8(1));
    bytes32 startB = bytes32(start);
    bytes32 stopB = bytes32(stop);
    bytes32 amountB = bytes32(amount);
    for (uint256 i = 0; i < 32; i++) {
      policy[1 + i] = startB[i];
      policy[33 + i] = stopB[i];
      policy[65 + i] = amountB[i];
    }
    return policy;
  }
}
