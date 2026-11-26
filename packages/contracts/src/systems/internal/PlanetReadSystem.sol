// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.24;

import { BaseSystem } from "systems/internal/BaseSystem.sol";
import { Ticker } from "codegen/tables/Ticker.sol";
import { MoveData } from "codegen/tables/Move.sol";
import { Planet } from "libraries/Planet.sol";
import { PlanetStatus } from "codegen/common.sol";
import { MoveLib } from "libraries/Move.sol";
import { ITickSystem } from "codegen/world/ITickSystem.sol";
import { IPlanetWriteSystem } from "codegen/world/IPlanetWriteSystem.sol";

contract PlanetReadSystem is BaseSystem {
  using MoveLib for MoveData;

  /**
   * @notice Read a planet from storage and sync it to the current tick given by ticker.
   * If the ticker is not up-to-date, the returned planet info is neither.
   * @dev Used for non-inited planets.
   * @param planetHash Planet hash
   * @param perlin Perlin noise
   * @param distanceSquare Square of distance to universe center
   */
  function readPlanet(
    uint256 planetHash,
    uint256 perlin,
    uint256 distanceSquare
  ) public view returns (Planet memory planet) {
    planet.planetHash = planetHash;
    planet.perlin = perlin;
    planet.distSquare = distanceSquare;
    planet.readFromStore();
    return _sync(planet);
  }

  /**
   * @notice Read a planet from storage and sync it to the current tick given by ticker.
   * If the ticker is not up-to-date, the returned planet info is neither.
   * @dev Used for inited planets.
   * @param planetHash Planet hash
   */
  function readPlanet(uint256 planetHash) public view returns (Planet memory planet) {
    planet.planetHash = planetHash;
    planet.readFromStore();
    return _sync(planet);
  }

  /**
   * @notice Read a planet from storage and sync it to the given tick. Designed for front-end.
   * @param planetHash Planet hash
   * @param tickNumber Tick number
   */
  function readPlanetAt(uint256 planetHash, uint256 tickNumber) public view returns (Planet memory planet) {
    planet.planetHash = planetHash;
    planet.readFromStore();
    return _syncTo(planet, tickNumber);
  }

  /**
   * @notice Settle arrivals for state-changing systems and persist their kill stats and planet state.
   * @dev View-only reads must keep using `readPlanet` so eth_call does not write tables.
   */
  function readPlanetWithKillStats(
    uint256 planetHash,
    uint256 perlin,
    uint256 distanceSquare
  ) public returns (Planet memory planet) {
    planet.planetHash = planetHash;
    planet.perlin = perlin;
    planet.distSquare = distanceSquare;
    planet.readFromStore();
    return _syncWithKillStats(planet);
  }

  function readPlanetWithKillStats(uint256 planetHash) public returns (Planet memory planet) {
    planet.planetHash = planetHash;
    planet.readFromStore();
    return _syncWithKillStats(planet);
  }

  function _sync(Planet memory planet) internal view returns (Planet memory) {
    uint256 untilTick = Ticker.getTickNumber();
    return _syncTo(planet, untilTick);
  }

  function _syncWithKillStats(Planet memory planet) internal returns (Planet memory) {
    ITickSystem(_world()).df__checkPlanetSyncGamePass(_msgSender());
    uint256 untilTick = Ticker.getTickNumber();
    if (planet.status != PlanetStatus.DEFAULT) return _syncTo(planet, untilTick);
    return _syncToWithKillStats(planet, untilTick);
  }

  function _syncTo(Planet memory planet, uint256 untilTick) internal view returns (Planet memory) {
    MoveData memory move = planet.popArrivedMove(untilTick);
    while (uint256(move.from) != 0) {
      planet.naturalGrowth(move.arrivalTick);
      (move, planet) = move.arrivedAt(planet);
      move = planet.popArrivedMove(untilTick);
    }
    planet.naturalGrowth(untilTick);
    return planet;
  }

  function _syncToWithKillStats(Planet memory planet, uint256 untilTick) internal returns (Planet memory) {
    MoveData memory move = planet.popArrivedMove(untilTick);
    while (uint256(move.from) != 0) {
      planet.naturalGrowth(move.arrivalTick);
      (move, planet) = move.arrivedAtRecordKills(planet);
      move = planet.popArrivedMove(untilTick);
    }
    planet.naturalGrowth(untilTick);
    if (planet.moveQueue.shouldWrite) {
      // Persist consumed arrivals in the same transaction as their kill stats.
      IPlanetWriteSystem(_world()).df__writePlanet(planet);
    }
    return planet;
  }
}
