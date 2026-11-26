// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import "forge-std/Test.sol";
import { BaseTest } from "./BaseTest.t.sol";
import { IWorld } from "codegen/world/IWorld.sol";
import { EntryFee, FeeRecipient, GlobalStats, GPTTokens, GuildConfig, JunkConfig, PlayerStats, RevenueStats, TempConfigSet, Ticker } from "codegen/index.sol";
import { Balances } from "@latticexyz/world/src/codegen/tables/Balances.sol";
import { ResourceId, WorldResourceIdLib } from "@latticexyz/world/src/WorldResourceId.sol";
import { PlanetType, SpaceType } from "codegen/common.sol";
import { Errors } from "interfaces/errors.sol";
import { Proof } from "libraries/SnarkProof.sol";
import { MoveInput } from "libraries/VerificationInput.sol";
import { IGPTTokensSystem } from "codegen/world/IGPTTokensSystem.sol";
import { IGuildSystem } from "codegen/world/IGuildSystem.sol";
import { IMoveSystem } from "codegen/world/IMoveSystem.sol";
import { IPlanetJunkSystem } from "codegen/world/IPlanetJunkSystem.sol";
import { MaterialMove } from "../src/lib/Material.sol";

contract RejectingWorldFeeRecipient {
  receive() external payable {
    revert();
  }
}

contract EntryFeeTest is BaseTest {
  function _mats(MaterialMove memory m1) internal pure returns (MaterialMove[11] memory a) {
    a[0] = m1;
  }

  function setUp() public override {
    super.setUp();

    vm.deal(user1, 100 ether);

    vm.startPrank(admin);
    // set entry fee to 1 ether
    EntryFee.setFee(1 ether);

    // unpause the universe if needed
    if (Ticker.getPaused()) {
      IWorld(worldAddress).df__unpause();
    }

    // skip snark check
    TempConfigSet.setSkipProofCheck(true);

    // init 2 planets
    IWorld(worldAddress).df__createPlanet(1, user1, 0, 1, PlanetType.PLANET, SpaceType.NEBULA, 300000, 10000, 0);
    IWorld(worldAddress).df__createPlanet(2, user2, 0, 1, PlanetType.PLANET, SpaceType.NEBULA, 200000, 10000, 0);

    vm.stopPrank();
  }

  function testMoveEntryFeeAndCounts() public {
    _assertMoveEntryFeeAndCounts(_moveCallData());
  }

  function _moveCallData() private pure returns (bytes memory) {
    Proof memory proof;
    MoveInput memory input;
    input.fromPlanetHash = 1;
    input.toPlanetHash = 2;
    input.distance = 80;
    return abi.encodeCall(IMoveSystem.df__move, (proof, input, 100000, 1000, 0, new MaterialMove[](0)));
  }

  function testLegacyMoveEntryFeeAndCounts() public {
    uint256[2] memory a;
    uint256[2][2] memory b;
    uint256[2] memory c;
    uint256[11] memory input;
    input[0] = 1;
    input[1] = 2;
    input[4] = 80;
    _assertMoveEntryFeeAndCounts(
      abi.encodeCall(
        IMoveSystem.df__legacyMove,
        (a, b, c, input, 100000, 1000, 0, 0, abi.encode(new MaterialMove[](0)))
      )
    );
  }

  function _assertMoveEntryFeeAndCounts(bytes memory callData) internal {
    bytes32 revenueKey = ResourceId.unwrap(WorldResourceIdLib.encode("sy", DF_NAMESPACE, "MoveSystem"));
    uint256 globalCount = GlobalStats.getMoveCount();
    uint256 playerCount = PlayerStats.getMoveCount(user1);
    uint256 revenue = RevenueStats.get(revenueKey);
    uint256 fee = EntryFee.getFee();

    vm.prank(user1);
    (bool success, bytes memory result) = worldAddress.call{ value: fee - 1 }(callData);
    assertFalse(success);
    assertEq(result, abi.encodeWithSelector(Errors.InsufficientEntryFee.selector, fee));
    assertEq(GlobalStats.getMoveCount(), globalCount);
    assertEq(PlayerStats.getMoveCount(user1), playerCount);
    assertEq(RevenueStats.get(revenueKey), revenue);

    vm.prank(user1);
    (success, ) = worldAddress.call{ value: fee }(callData);
    assertTrue(success);
    assertEq(GlobalStats.getMoveCount(), globalCount + 1);
    assertEq(PlayerStats.getMoveCount(user1), playerCount + 1);
    assertEq(RevenueStats.get(revenueKey), revenue + fee);
  }

  function testUpdateEntryFee() public {
    vm.expectRevert();
    IWorld(worldAddress).df__updateEntryFee(2 ether);

    vm.startPrank(admin);
    IWorld(worldAddress).df__updateEntryFee(2 ether);
    vm.stopPrank();

    assertEq(EntryFee.getFee(), 2 ether);
  }

  function testConfiguredRecipientReceivesAllFourFeeCategories() public {
    IWorld world = IWorld(worldAddress);
    vm.prank(user1);
    world.df__registerPlayer("Fee payer", makeAddr("payer burner"));

    // Seed an existing treasury balance using the unconfigured route.
    uint256 creditPrice = 0.00001 ether;
    uint256 worldBalance = worldAddress.balance;
    uint256 treasuryBalance = _treasuryBalance();
    vm.prank(user1);
    world.df__buyGPTTokens{ value: creditPrice }(1);
    assertEq(worldAddress.balance, worldBalance + creditPrice);
    assertEq(_treasuryBalance(), treasuryBalance + creditPrice);

    address recipient = makeAddr("fee recipient");
    vm.prank(admin);
    world.df__updateFeeRecipient(recipient);

    _assertRoutedFee(_moveCallData(), EntryFee.getFee() + 1 wei, recipient);
    _assertRoutedFee(
      abi.encodeCall(IGuildSystem.df__createGuild, ("Fee test guild")),
      GuildConfig.getCreateFee(),
      recipient
    );
    _assertRoutedFee(
      abi.encodeCall(IPlanetJunkSystem.df__buyJunk, (JunkConfig.getSPACE_JUNK_LINEAR_MIN_PURCHASE())),
      JunkConfig.getSPACE_JUNK_LINEAR_BASE_PRICE(),
      recipient
    );
    _assertRoutedFee(abi.encodeCall(IGPTTokensSystem.df__buyGPTTokens, (2)), 2 * creditPrice, recipient);
    assertEq(GPTTokens.get(user1), 3);
  }

  function testUpdateFeeRecipientRequiresNamespaceOwnerAndCanClear() public {
    IWorld world = IWorld(worldAddress);
    ResourceId adminSystemId = WorldResourceIdLib.encode("sy", DF_NAMESPACE, "AdminSystem");
    address recipient = makeAddr("fee recipient");
    vm.prank(admin);
    world.grantAccess(adminSystemId, user2);

    vm.prank(user2);
    world.df__updateEntryFee(2 ether);
    assertEq(EntryFee.getFee(), 2 ether);

    vm.prank(user2);
    vm.expectRevert();
    world.df__updateFeeRecipient(recipient);
    assertEq(FeeRecipient.getRecipient(), address(0));

    vm.prank(admin);
    world.df__updateFeeRecipient(recipient);
    assertEq(FeeRecipient.getRecipient(), recipient);

    vm.prank(admin);
    vm.expectRevert();
    world.df__updateFeeRecipient(worldAddress);
    assertEq(FeeRecipient.getRecipient(), recipient);

    vm.prank(admin);
    world.df__updateFeeRecipient(address(0));
    assertEq(FeeRecipient.getRecipient(), address(0));
  }

  function testRecipientRejectingTransferRollsBackPurchaseAndFee() public {
    IWorld world = IWorld(worldAddress);
    address recipient = address(new RejectingWorldFeeRecipient());
    vm.prank(admin);
    world.df__updateFeeRecipient(recipient);

    bytes32 revenueKey = ResourceId.unwrap(WorldResourceIdLib.encode("sy", DF_NAMESPACE, "GPTTokensSystem"));
    uint256 revenue = RevenueStats.get(revenueKey);
    uint256 credits = GPTTokens.get(user1);
    uint256 worldBalance = worldAddress.balance;
    uint256 treasuryBalance = _treasuryBalance();
    uint256 payerBalance = user1.balance;

    vm.prank(user1);
    vm.expectRevert();
    world.df__buyGPTTokens{ value: 0.00001 ether }(1);

    assertEq(RevenueStats.get(revenueKey), revenue);
    assertEq(GPTTokens.get(user1), credits);
    assertEq(worldAddress.balance, worldBalance);
    assertEq(_treasuryBalance(), treasuryBalance);
    assertEq(user1.balance, payerBalance);
  }

  function _assertRoutedFee(bytes memory callData, uint256 value, address recipient) private {
    uint256 recipientBalance = recipient.balance;
    uint256 worldBalance = worldAddress.balance;
    uint256 treasuryBalance = _treasuryBalance();
    uint256 payerBalance = user1.balance;

    vm.prank(user1);
    (bool success, bytes memory result) = worldAddress.call{ value: value }(callData);
    assertTrue(success, vm.toString(result));
    assertEq(recipient.balance, recipientBalance + value);
    assertEq(worldAddress.balance, worldBalance);
    assertEq(_treasuryBalance(), treasuryBalance);
    assertEq(user1.balance, payerBalance - value);
  }

  function _treasuryBalance() private view returns (uint256) {
    return Balances.get(WorldResourceIdLib.encodeNamespace(DF_NAMESPACE));
  }
}
