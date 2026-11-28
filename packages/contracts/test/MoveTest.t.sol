// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import "forge-std/Test.sol";
import { BaseTest } from "./BaseTest.t.sol";
import { IWorld } from "../src/codegen/world/IWorld.sol";
import { Ticker, TickerData, PendingMove, PendingMoveData, Move, MoveData } from "../src/codegen/index.sol";
import { Planet as PlanetTable, Counter, TempConfigSet } from "../src/codegen/index.sol";
import { PlayerKillStats } from "../src/codegen/tables/PlayerKillStats.sol";
import { MoveMaterial } from "../src/codegen/tables/MoveMaterial.sol";
import { Errors } from "../src/interfaces/errors.sol";
import { PlanetType, SpaceType, MaterialType } from "../src/codegen/common.sol";
import { Planet } from "../src/lib/Planet.sol";
import { Proof } from "../src/lib/SnarkProof.sol";
import { MoveInput } from "../src/lib/VerificationInput.sol";
import { ABDKMath64x64 } from "abdk-libraries-solidity/ABDKMath64x64.sol";
import { MaterialMove } from "../src/lib/Material.sol";
import { PlanetMaterial } from "../src/codegen/tables/PlanetMaterial.sol";
import { PlanetMaterialStorage } from "../src/codegen/tables/PlanetMaterialStorage.sol";

import { PlanetArtifact } from "../src/codegen/tables/PlanetArtifact.sol";

contract MoveTest is BaseTest {
  function _mats(MaterialMove memory m1) internal pure returns (MaterialMove[] memory a) {
    a = new MaterialMove[](1);
    a[0] = m1;
  }

  function setUp() public override {
    super.setUp();

    vm.startPrank(admin);
    // skip snark check
    TempConfigSet.setSkipProofCheck(true);

    // unpause the universe if needed
    if (Ticker.getPaused()) {
      IWorld(worldAddress).df__unpause();
    }

    // init 2 planets
    IWorld(worldAddress).df__createPlanet(1, user1, 0, 1, PlanetType.PLANET, SpaceType.NEBULA, 300000, 10000, 0);
    IWorld(worldAddress).df__createPlanet(2, user2, 0, 1, PlanetType.PLANET, SpaceType.NEBULA, 200000, 10000, 0);

    // set tick rate to 1
    Ticker.setTickRate(1);
    vm.stopPrank();
  }

  function testMove() public {
    vm.warp(block.timestamp + 1000);
    Planet memory planet1 = IWorld(worldAddress).df__readPlanet(1);
    Planet memory planet2 = IWorld(worldAddress).df__readPlanet(2);
    assertEq(planet1.population, 300000);
    assertEq(planet1.silver, 10000);

    Proof memory proof;
    MoveInput memory input;
    input.fromPlanetHash = planet1.planetHash;
    input.toPlanetHash = planet2.planetHash;
    input.distance = 80;
    vm.prank(user1);
    IWorld(worldAddress).df__move(proof, input, 100000, 1000, 0, new MaterialMove[](0));
    PendingMoveData memory pendingMove = PendingMove.get(bytes32(planet2.planetHash));
    assertEq(pendingMove.head, 0);
    assertEq(pendingMove.number, 1);
    uint256 index = _getIndexAt(pendingMove, 0);
    assertEq(index, 0);
    MoveData memory move1 = Move.get(bytes32(planet2.planetHash), uint8(index));
    assertEq(move1.captain, user1);
    assertEq(move1.id, 1);
    assertEq(move1.from, bytes32(planet1.planetHash));
    assertEq(move1.departureTick, Ticker.getTickNumber());
    assertEq(move1.arrivalTick, move1.departureTick + (input.distance * 100) / planet1.speed);
    assertEq(
      move1.population,
      ABDKMath64x64.toUInt(
        ABDKMath64x64.div(
          ABDKMath64x64.fromUInt(100000),
          ABDKMath64x64.exp_2(ABDKMath64x64.divu(input.distance, planet1.range))
        ) - ABDKMath64x64.divu(planet1.populationCap, 20)
      )
    );
    assertEq(move1.silver, 1000);
    assertEq(move1.artifact, 0);
    assertEq(
      _getPopulationAtTick(planet1, move1.departureTick) - 100000,
      PlanetTable.getPopulation(bytes32(planet1.planetHash))
    );
    assertEq(planet1.silver - 1000, PlanetTable.getSilver(bytes32(planet1.planetHash)));
  }

  function testMoveWithMaterials() public {
    vm.warp(block.timestamp + 1000);
    IWorld world = IWorld(worldAddress);
    bytes32 source = bytes32(uint256(1));
    bytes32 destination = bytes32(uint256(2));
    uint256 capacity = world.df__readPlanet(2).silverCap;

    vm.startPrank(admin);
    world.df__addMaterial(1, MaterialType(1), 100);
    world.df__addMaterial(1, MaterialType(2), 120);
    world.df__addMaterial(2, MaterialType(2), capacity - 25);
    vm.stopPrank();

    MaterialMove[] memory materials = new MaterialMove[](3);
    materials[0] = MaterialMove({ resourceId: 1, amount: 40 });
    materials[1] = MaterialMove({ resourceId: 2, amount: 75 });
    materials[2] = MaterialMove({ resourceId: 1, amount: 60 });
    _sendMaterialFleet(materials);

    MoveData memory outbound = _queuedMove(2, 0);
    assertEq(PlanetMaterial.get(source, 1), 0);
    assertEq(PlanetMaterial.get(source, 2), 45);
    assertEq(MoveMaterial.getAmount(outbound.id, 1), 100);
    assertEq(MoveMaterial.getAmount(outbound.id, 2), 75);
    assertEq(PlanetMaterial.get(destination, 1), 0);
    assertEq(PlanetMaterial.get(destination, 2), capacity - 25);

    Planet memory arrival = world.df__readPlanetAt(2, outbound.arrivalTick);
    assertEq(arrival.materialStorage.getMaterial(2, MaterialType(1)), 100);
    assertEq(arrival.materialStorage.getMaterial(2, MaterialType(2)), capacity);

    vm.warp(_getTimestampAtTick(outbound.arrivalTick));
    _sendMaterialFleet(new MaterialMove[](0));

    assertEq(PlanetMaterial.get(destination, 1), 100);
    assertEq(PlanetMaterial.get(destination, 2), capacity);
    assertEq(PlanetMaterialStorage.get(source), (1 << 1) | (1 << 2), "material kinds are still recorded");
    assertEq(PlanetMaterialStorage.get(destination), (1 << 1) | (1 << 2));
    assertEq(PendingMove.getNumber(destination), 1);
    assertGt(_queuedMove(2, 0).id, outbound.id);
  }

  function testRepeatedMaterialsRevertAtomicallyWhenTotalExceedsStock() public {
    vm.warp(block.timestamp + 1000);
    vm.prank(admin);
    IWorld(worldAddress).df__addMaterial(1, MaterialType(1), 100);

    MaterialMove[] memory materials = new MaterialMove[](2);
    materials[0] = MaterialMove({ resourceId: 1, amount: 60 });
    materials[1] = MaterialMove({ resourceId: 1, amount: 41 });
    uint64 moveCount = Counter.getMove();

    vm.expectRevert(Errors.NotEnoughMaterial.selector);
    _sendMaterialFleet(materials);

    assertEq(PlanetMaterial.get(bytes32(uint256(1)), 1), 100);
    assertEq(Counter.getMove(), moveCount);
    assertEq(MoveMaterial.getAmount(moveCount + 1, 1), 0);
    assertEq(PendingMove.getNumber(bytes32(uint256(2))), 0);
  }

  function testRecallHalvesTotalMaterialCargoOnce() public {
    vm.warp(block.timestamp + 1000);
    IWorld world = IWorld(worldAddress);
    bytes32 source = bytes32(uint256(1));
    bytes32 destination = bytes32(uint256(2));

    vm.prank(admin);
    world.df__addMaterial(1, MaterialType(1), 103);

    MaterialMove[] memory materials = new MaterialMove[](3);
    materials[0] = MaterialMove({ resourceId: 1, amount: 41 });
    materials[1] = MaterialMove({ resourceId: 1, amount: 61 });
    materials[2] = MaterialMove({ resourceId: 1, amount: 1 });
    _sendMaterialFleet(materials);

    MoveData memory outbound = _queuedMove(2, 0);
    assertEq(PlanetMaterial.get(source, 1), 0);
    assertEq(MoveMaterial.getAmount(outbound.id, 1), 103);

    vm.warp(_getTimestampAtTick(outbound.departureTick + 5));
    vm.prank(user1);
    world.df__revertMove(outbound.id, destination);

    MoveData memory returning = _queuedMove(1, 0);
    assertEq(returning.id, outbound.id);
    assertEq(PendingMove.getNumber(destination), 0);
    assertEq(MoveMaterial.getAmount(returning.id, 1), 51);
    assertEq(PlanetMaterial.get(source, 1), 0);

    vm.warp(_getTimestampAtTick(returning.arrivalTick));
    _sendMaterialFleet(new MaterialMove[](0));

    assertEq(PlanetMaterial.get(source, 1), 51);
    assertEq(PlanetMaterial.get(destination, 1), 0);
    assertEq(PendingMove.getNumber(source), 0);
  }

  function testPendingMove() public {
    vm.warp(block.timestamp + 1000);
    Planet memory planet1 = IWorld(worldAddress).df__readPlanet(1);
    Planet memory planet2 = IWorld(worldAddress).df__readPlanet(2);

    Proof memory proof;
    MoveInput memory input;
    input.fromPlanetHash = planet1.planetHash;
    input.toPlanetHash = planet2.planetHash;
    input.distance = 320;
    vm.prank(user1);
    IWorld(worldAddress).df__move(proof, input, 100000, 1000, 0, _mats(MaterialMove({ resourceId: 0, amount: 0 })));
    PendingMoveData memory pendingMove = PendingMove.get(bytes32(planet2.planetHash));
    uint256 index = _getIndexAt(pendingMove, 0);
    MoveData memory move1 = Move.get(bytes32(planet2.planetHash), uint8(index));

    input.distance /= 2;
    planet1 = IWorld(worldAddress).df__readPlanet(1);
    vm.prank(user1);
    IWorld(worldAddress).df__move(proof, input, 110000, 1000, 0, _mats(MaterialMove({ resourceId: 0, amount: 0 })));
    pendingMove = PendingMove.get(bytes32(planet2.planetHash));
    assertEq(pendingMove.head, 0);
    assertEq(pendingMove.number, 2);
    // the second move takes less time to arrive than the first move
    index = _getIndexAt(pendingMove, 1);
    assertEq(index, 0);
    index = _getIndexAt(pendingMove, 0);
    assertEq(index, 1);
    MoveData memory move2 = Move.get(bytes32(planet2.planetHash), uint8(index));
    assertEq(move2.id, 2);
    assertEq(move2.departureTick, move1.departureTick);
    assertEq(move2.arrivalTick, move2.departureTick + (input.distance * 100) / planet1.speed);
    assertEq(move2.arrivalTick - move2.departureTick, (move1.arrivalTick - move1.departureTick) / 2);
    assertEq(planet1.population - 110000, PlanetTable.getPopulation(bytes32(planet1.planetHash)));
    assertEq(planet1.silver - 1000, PlanetTable.getSilver(bytes32(planet1.planetHash)));

    input.distance *= 2;
    vm.warp(_getTimestampAtTick(move2.arrivalTick));
    planet2 = IWorld(worldAddress).df__readPlanet(2);
    vm.prank(user1);
    IWorld(worldAddress).df__move(proof, input, 120000, 1000, 0, _mats(MaterialMove({ resourceId: 0, amount: 0 })));
    pendingMove = PendingMove.get(bytes32(planet2.planetHash));
    assertEq(pendingMove.head, 1);
    assertEq(pendingMove.number, 2);
    // the second move (index 1) has arrived, the third move(index 1) was newly pushed into the queue
    index = _getIndexAt(pendingMove, 0);
    assertEq(index, 0);
    index = _getIndexAt(pendingMove, 1);
    assertEq(index, 1);
    MoveData memory move3 = Move.get(bytes32(planet2.planetHash), uint8(index));
    assertEq(Counter.getMove(), 3);
    assertEq(move3.id, 3);
    assertEq(
      _getPopulationAtTick(planet2, move2.arrivalTick) - (move2.population * 100) / planet2.defense,
      PlanetTable.getPopulation(bytes32(planet2.planetHash))
    );
    assertEq(planet2.silver + move2.silver, PlanetTable.getSilver(bytes32(planet2.planetHash)));
  }

  function testEnemyKillStatsRecorded() public {
    vm.warp(block.timestamp + 1000);
    Planet memory planet1 = IWorld(worldAddress).df__readPlanet(1);
    Planet memory planet2 = IWorld(worldAddress).df__readPlanet(2);

    Proof memory proof;
    MoveInput memory input;
    input.fromPlanetHash = planet1.planetHash;
    input.toPlanetHash = planet2.planetHash;
    input.distance = 320;
    vm.prank(user1);
    IWorld(worldAddress).df__move(proof, input, 100000, 1000, 0, new MaterialMove[](0));

    input.distance /= 2;
    planet1 = IWorld(worldAddress).df__readPlanet(1);
    vm.prank(user1);
    IWorld(worldAddress).df__move(proof, input, 110000, 1000, 0, new MaterialMove[](0));

    MoveData memory firstArrival = _queuedMove(planet2.planetHash, 0);
    MoveData memory secondArrival = _queuedMove(planet2.planetHash, 1);
    assertLt(firstArrival.arrivalTick, secondArrival.arrivalTick);

    input.distance *= 2;
    vm.warp(_getTimestampAtTick(secondArrival.arrivalTick));
    vm.prank(user1);
    IWorld(worldAddress).df__move(proof, input, 120000, 1000, 0, new MaterialMove[](0));

    uint256 expectedDestroyed = (firstArrival.population * 100) /
      planet2.defense +
      (secondArrival.population * 100) /
      planet2.defense;
    assertEq(PlayerKillStats.get(user1), expectedDestroyed);
  }

  function testPlanetEmojiSettlesArrivedFleetAndBattleStatsTogether() public {
    vm.warp(block.timestamp + 1000);
    Planet memory destination = IWorld(worldAddress).df__readPlanet(2);
    bytes32 destinationKey = bytes32(destination.planetHash);

    vm.prank(admin);
    IWorld(worldAddress).df__addMaterial(1, MaterialType(1), 100);

    Proof memory proof;
    MoveInput memory input;
    input.fromPlanetHash = 1;
    input.toPlanetHash = destination.planetHash;
    input.distance = 80;
    vm.prank(user1);
    IWorld(worldAddress).df__move(proof, input, 100000, 1000, 0, _mats(MaterialMove({ resourceId: 1, amount: 100 })));

    MoveData memory arrived = _queuedMove(destination.planetHash, 0);
    assertEq(PendingMove.getNumber(destinationKey), 1);
    assertEq(PlayerKillStats.get(user1), 0);

    uint256 destroyed = (arrived.population * 100) / destination.defense;
    assertGt(destroyed, 0);
    Planet memory preview = IWorld(worldAddress).df__readPlanetAt(destination.planetHash, arrived.arrivalTick);
    assertEq(preview.moveQueue.number, 0);
    assertEq(PendingMove.getNumber(destinationKey), 1);
    assertEq(PlayerKillStats.get(user1), 0);
    vm.warp(_getTimestampAtTick(arrived.arrivalTick));
    vm.prank(user2);
    IWorld(worldAddress).df__setPlanetEmoji(destination.planetHash, "!");

    assertEq(PendingMove.getNumber(destinationKey), 0);
    assertEq(PlayerKillStats.get(user1), destroyed);
    assertEq(PlanetTable.getLastUpdateTick(destinationKey), arrived.arrivalTick);
    assertEq(PlanetTable.getPopulation(destinationKey), preview.population);
    assertEq(PlanetTable.getSilver(destinationKey), destination.silver + arrived.silver);
    assertEq(PlanetMaterial.get(destinationKey, uint8(1)), 100);

    _sendFleet(user2, destination.planetHash, 1, 80);
    assertEq(PlayerKillStats.get(user1), destroyed);
    assertEq(PlanetMaterial.get(destinationKey, uint8(1)), 100);
  }

  function testNeutralPlanetAttackDoesNotRecordKills() public {
    vm.startPrank(admin);
    IWorld(worldAddress).df__createPlanet(3, address(0), 0, 1, PlanetType.PLANET, SpaceType.NEBULA, 200000, 10000, 0);
    vm.stopPrank();

    vm.warp(block.timestamp + 1000);
    Planet memory planet1 = IWorld(worldAddress).df__readPlanet(1);
    Planet memory neutralPlanet = IWorld(worldAddress).df__readPlanet(3);

    Proof memory proof;
    MoveInput memory input;
    input.fromPlanetHash = planet1.planetHash;
    input.toPlanetHash = neutralPlanet.planetHash;
    input.distance = 80;
    vm.prank(user1);
    IWorld(worldAddress).df__move(proof, input, 100000, 1000, 0, new MaterialMove[](0));

    assertEq(PlayerKillStats.get(user1), 0);
  }

  function testCapturePlanet() public {
    vm.warp(block.timestamp + 1000);
    Planet memory planet1 = IWorld(worldAddress).df__readPlanet(1);
    Planet memory planet2 = IWorld(worldAddress).df__readPlanet(2);

    Proof memory proof;
    MoveInput memory input;
    input.fromPlanetHash = planet1.planetHash;
    input.toPlanetHash = planet2.planetHash;
    input.distance = 320;
    vm.prank(user1);
    IWorld(worldAddress).df__move(proof, input, 100000, 1000, 0, _mats(MaterialMove({ resourceId: 0, amount: 0 })));
    PendingMoveData memory pendingMove = PendingMove.get(bytes32(planet2.planetHash));
    uint256 index = _getIndexAt(pendingMove, 0);
    MoveData memory move1 = Move.get(bytes32(planet2.planetHash), uint8(index));
    input.distance *= 2;
    vm.prank(user1);
    IWorld(worldAddress).df__move(proof, input, 200000, 1000, 0, _mats(MaterialMove({ resourceId: 0, amount: 0 })));
    pendingMove = PendingMove.get(bytes32(planet2.planetHash));
    index = _getIndexAt(pendingMove, 1);
    MoveData memory move2 = Move.get(bytes32(planet2.planetHash), uint8(index));

    vm.warp(_getTimestampAtTick(move1.arrivalTick));
    planet2 = IWorld(worldAddress).df__readPlanet(2);
    planet2.population = 1;
    vm.startPrank(admin);
    // set the planet2 population to 1 to let user1 captures it
    PlanetTable.setPopulation(bytes32(planet2.planetHash), 1);
    IWorld(worldAddress).df__tick();
    Planet memory latestPlanet2 = IWorld(worldAddress).df__readPlanet(2);
    assertEq(latestPlanet2.owner, user1);
    assertEq(
      latestPlanet2.population,
      move1.population - ((_getPopulationAtTick(planet2, move1.arrivalTick) * planet2.defense) / 100)
    );
    assertEq(latestPlanet2.silver, move1.silver + planet2.silver);

    vm.warp(_getTimestampAtTick(move2.arrivalTick));
    planet2 = latestPlanet2;
    IWorld(worldAddress).df__tick();
    latestPlanet2 = IWorld(worldAddress).df__readPlanet(2);
    assertEq(latestPlanet2.owner, user1);
    assertEq(latestPlanet2.population, move2.population + _getPopulationAtTick(planet2, move2.arrivalTick));
    assertEq(latestPlanet2.silver, move2.silver + planet2.silver);
  }

  function testRegressionRecallChecksArtifactCapacity() public {
    vm.warp(block.timestamp + 1000);
    _sendFleet(user1, 1, 2, 80);
    bytes32 destination = bytes32(uint256(2));
    MoveData memory outbound = _queuedMove(2, 0);
    vm.startPrank(admin);
    Move.setArtifact(destination, _getIndexAt(PendingMove.get(destination), 0), 9);
    uint256 inventory;
    for (uint256 id = 1; id <= 8; ++id) inventory = (inventory << 32) | id;
    PlanetArtifact.setArtifacts(bytes32(uint256(1)), inventory);
    vm.stopPrank();
    vm.warp(_getTimestampAtTick(outbound.departureTick + 5));
    vm.prank(user1);
    vm.expectRevert(Errors.ArtifactStorageFull.selector);
    IWorld(worldAddress).df__revertMove(outbound.id, destination);
    assertEq(_queuedMove(2, 0).artifact, 9);

    vm.prank(admin);
    PlanetArtifact.setArtifacts(bytes32(uint256(1)), inventory >> 32);
    vm.prank(user1);
    IWorld(worldAddress).df__revertMove(outbound.id, destination);
    assertEq(_queuedMove(1, 0).artifact, 9);
  }

  function testRevertMovePreservesOtherFlightsAndReusesFreedSlot() public {
    vm.warp(block.timestamp + 1000);
    _sendFleet(user2, 2, 1, 80);
    MoveData memory inbound = _queuedMove(1, 0);
    _sendFleet(user1, 1, 2, 80);
    MoveData memory outbound = _queuedMove(2, 0);
    _sendFleet(user1, 1, 2, 96);
    MoveData memory remainingOutbound = _queuedMove(2, 1);

    vm.warp(_getTimestampAtTick(outbound.departureTick + 5));
    vm.prank(user1);
    IWorld(worldAddress).df__revertMove(outbound.id, bytes32(uint256(2)));

    assertEq(PendingMove.getNumber(bytes32(uint256(1))), 2);
    assertEq(PendingMove.getNumber(bytes32(uint256(2))), 1);
    MoveData memory returning = _queuedMove(1, 0);
    assertEq(returning.id, outbound.id);
    assertEq(returning.captain, outbound.captain);
    assertEq(returning.from, bytes32(uint256(2)));
    assertEq(returning.arrivalTick, outbound.departureTick + 10);
    assertEq(returning.population, outbound.population / 2);
    assertEq(returning.silver, outbound.silver / 2);
    assertEq(abi.encode(_queuedMove(1, 1)), abi.encode(inbound));
    assertEq(abi.encode(_queuedMove(2, 0)), abi.encode(remainingOutbound));
    assertTrue(IWorld(worldAddress).df__isMoveReverted(outbound.id));
    assertEq(Counter.getMove(), remainingOutbound.id);

    _sendFleet(user1, 1, 2, 112);
    assertEq(PendingMove.getNumber(bytes32(uint256(2))), 2);
    assertEq(abi.encode(_queuedMove(2, 0)), abi.encode(remainingOutbound));
    assertEq(_queuedMove(2, 1).id, Counter.getMove());
  }

  function testRevertMovePersistsReturnWhenSourceSettlesAnArrival() public {
    vm.warp(block.timestamp + 1000);
    _sendFleet(user2, 2, 1, 16);
    MoveData memory arriving = _queuedMove(1, 0);
    _sendFleet(user2, 2, 1, 96);
    MoveData memory pending = _queuedMove(1, 1);
    _sendFleet(user1, 1, 2, 128);
    MoveData memory outbound = _queuedMove(2, 0);
    uint256 silverBeforeArrival = PlanetTable.getSilver(bytes32(uint256(1)));

    vm.warp(_getTimestampAtTick(arriving.arrivalTick));
    vm.prank(user1);
    IWorld(worldAddress).df__revertMove(outbound.id, bytes32(uint256(2)));

    assertEq(PlanetTable.getSilver(bytes32(uint256(1))), silverBeforeArrival + arriving.silver);
    assertEq(PendingMove.getNumber(bytes32(uint256(1))), 2);
    assertEq(_queuedMove(1, 0).id, outbound.id);
    assertEq(abi.encode(_queuedMove(1, 1)), abi.encode(pending));
    assertEq(PendingMove.getNumber(bytes32(uint256(2))), 0);
  }

  function _sendFleet(address captain, uint256 from, uint256 to, uint256 distance) internal {
    Proof memory proof;
    MoveInput memory input;
    input.fromPlanetHash = from;
    input.toPlanetHash = to;
    input.distance = distance;
    vm.prank(captain);
    IWorld(worldAddress).df__move(proof, input, 80000, 1000, 0, new MaterialMove[](0));
  }

  function _sendMaterialFleet(MaterialMove[] memory materials) internal {
    Proof memory proof;
    MoveInput memory input;
    input.fromPlanetHash = 1;
    input.toPlanetHash = 2;
    input.distance = 80;
    vm.prank(user1);
    IWorld(worldAddress).df__move(proof, input, 100000, 1000, 0, materials);
  }

  function _queuedMove(uint256 planetHash, uint8 queuePosition) internal view returns (MoveData memory) {
    bytes32 key = bytes32(planetHash);
    return Move.get(key, _getIndexAt(PendingMove.get(key), queuePosition));
  }

  function _getIndexAt(PendingMoveData memory pendingMove, uint8 i) internal pure returns (uint8) {
    return uint8(pendingMove.indexes >> (8 * (29 - ((pendingMove.head + i) % 30))));
  }

  function _getTimestampAtTick(uint256 tick) internal view returns (uint256) {
    TickerData memory ticker = Ticker.get();
    return ticker.timestamp + (tick - ticker.tickNumber) / ticker.tickRate;
  }

  function _getPopulationAtTick(Planet memory planet, uint256 tick) internal pure returns (uint256) {
    uint256 tickElapsed = tick - planet.lastUpdateTick;

    if (planet.owner != planet.junkOwner) tickElapsed = 0;

    if (tickElapsed == 0) {
      return planet.population;
    }
    if (planet.populationGrowth == 0) {
      return planet.population;
    }
    int128 time = ABDKMath64x64.fromUInt(tickElapsed);
    int128 one = ABDKMath64x64.fromUInt(1);

    int128 denominator = ABDKMath64x64.add(
      ABDKMath64x64.mul(
        ABDKMath64x64.exp(
          ABDKMath64x64.div(
            ABDKMath64x64.mul(
              ABDKMath64x64.mul(ABDKMath64x64.fromInt(-4), ABDKMath64x64.fromUInt(planet.populationGrowth)),
              time
            ),
            ABDKMath64x64.fromUInt(planet.populationCap)
          )
        ),
        ABDKMath64x64.sub(
          ABDKMath64x64.div(ABDKMath64x64.fromUInt(planet.populationCap), ABDKMath64x64.fromUInt(planet.population)),
          one
        )
      ),
      one
    );

    return ABDKMath64x64.toUInt(ABDKMath64x64.div(ABDKMath64x64.fromUInt(planet.populationCap), denominator));
  }
}
