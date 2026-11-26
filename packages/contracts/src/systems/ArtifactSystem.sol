// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.24;

import { BaseSystem } from "systems/internal/BaseSystem.sol";
import { Planet } from "libraries/Planet.sol";
import { Artifact } from "libraries/Artifact.sol";
import { Counter, AtfInstallModule, ArtifactRegistry } from "codegen/index.sol";
import { DFUtils } from "libraries/DFUtils.sol";
import { GlobalStats } from "codegen/tables/GlobalStats.sol";
import { PlayerStats } from "codegen/tables/PlayerStats.sol";

contract ArtifactSystem is BaseSystem {
  // 安装模块登记神器，调用方不是玩家。入场检查在玩家发起的充能、激活和关闭上。
  function registerArtifact(uint256 artifactId) public {
    if (_msgSender() != AtfInstallModule.get()) {
      revert OnlyCallableByArtifactInstallModule();
    }
    if (ArtifactRegistry.get(bytes32(artifactId))) {
      revert ExistingArtifact();
    }
    ArtifactRegistry.set(bytes32(artifactId), true);
  }

  function chargeArtifact(
    uint256 planetHash,
    uint256 artifactId,
    bytes memory data
  ) public requireGamePass entryFee requireSameOwnerAndJunkOwner(planetHash) {
    GlobalStats.setChargeArtifactCount(GlobalStats.getChargeArtifactCount() + 1);
    PlayerStats.setChargeArtifactCount(_msgSender(), PlayerStats.getChargeArtifactCount(_msgSender()) + 1);

    address worldAddress = _world();
    (Planet memory planet, Artifact memory artifact) = _readOwnedArtifact(worldAddress, planetHash, artifactId);
    (planet, artifact) = planet.chargeArtifact(artifact, data, worldAddress);

    artifact.writeToStore();
    planet.writeToStore();
  }

  function shutdownArtifact(
    uint256 planetHash,
    uint256 artifactId
  ) public requireGamePass entryFee requireSameOwnerAndJunkOwner(planetHash) {
    GlobalStats.setShutdownArtifactCount(GlobalStats.getShutdownArtifactCount() + 1);
    PlayerStats.setShutdownArtifactCount(_msgSender(), PlayerStats.getShutdownArtifactCount(_msgSender()) + 1);

    address worldAddress = _world();
    (Planet memory planet, Artifact memory artifact) = _readOwnedArtifact(worldAddress, planetHash, artifactId);
    (planet, artifact) = planet.shutdownArtifact(artifact, worldAddress);

    artifact.writeToStore();
    planet.writeToStore();
  }

  function activateArtifact(
    uint256 planetHash,
    uint256 artifactId,
    bytes memory data
  ) public requireGamePass entryFee requireSameOwnerAndJunkOwner(planetHash) {
    GlobalStats.setActivateArtifactCount(GlobalStats.getActivateArtifactCount() + 1);
    PlayerStats.setActivateArtifactCount(_msgSender(), PlayerStats.getActivateArtifactCount(_msgSender()) + 1);

    address worldAddress = _world();
    (Planet memory planet, Artifact memory artifact) = _readOwnedArtifact(worldAddress, planetHash, artifactId);
    (planet, artifact) = planet.activateArtifact(artifact, data, worldAddress);

    artifact.writeToStore();
    planet.writeToStore();
  }

  function _readOwnedArtifact(
    address worldAddress,
    uint256 planetHash,
    uint256 artifactId
  ) private returns (Planet memory planet, Artifact memory artifact) {
    DFUtils.tick(worldAddress);

    planet = DFUtils.readInitedPlanet(worldAddress, planetHash);
    artifact = planet.mustGetArtifact(artifactId);
    if (planet.owner != _msgSender()) {
      revert NotPlanetOwner();
    }
  }
}
