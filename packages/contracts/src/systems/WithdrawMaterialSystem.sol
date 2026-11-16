// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.24;

import { BaseSystem } from "systems/internal/BaseSystem.sol";
import { Planet } from "libraries/Planet.sol";
import { PlanetType, MaterialType, Biome } from "codegen/common.sol";
import { PlayerWithdrawMaterial } from "codegen/tables/PlayerWithdrawMaterial.sol";
import { PlayerScore } from "codegen/tables/PlayerScore.sol";
import { DFUtils } from "libraries/DFUtils.sol";
import { GuildUtils } from "libraries/GuildUtils.sol";
import { Guild } from "codegen/tables/Guild.sol";
import { GlobalStats } from "codegen/tables/GlobalStats.sol";
import { PlayerStats } from "codegen/tables/PlayerStats.sol";
import { Errors } from "interfaces/errors.sol";
import { DFXStarStakingLib } from "libraries/DFXStarStakingLib.sol";

contract WithdrawMaterialSystem is BaseSystem {
  /**
   * @notice Withdraw material on Spacetime RIP with biome-based scoring.
   * @param planetHash Planet hash
   * @param materialType Material type to withdraw
   * @param materialToWithdraw Material amount to withdraw
   */
  function withdrawMaterial(
    uint256 planetHash,
    MaterialType materialType,
    uint256 materialToWithdraw
  ) public entryFee requireSameOwnerAndJunkOwner(planetHash) {
    _updateStats();
    _processWithdrawal(planetHash, materialType, materialToWithdraw);
  }

  function _updateStats() internal {
    GlobalStats.setWithdrawMaterialCount(GlobalStats.getWithdrawMaterialCount() + 1);
    PlayerStats.setWithdrawMaterialCount(_msgSender(), PlayerStats.getWithdrawMaterialCount(_msgSender()) + 1);
  }

  function _processWithdrawal(uint256 planetHash, MaterialType materialType, uint256 materialToWithdraw) internal {
    address worldAddress = _world();
    DFUtils.tick(worldAddress);

    Planet memory planet = DFUtils.readInitedPlanet(worldAddress, planetHash);
    address executor = _msgSender();

    _validateWithdrawal(planet, executor, materialType, materialToWithdraw);
    _executeWithdrawal(planet, executor, materialType, materialToWithdraw);
  }

  function _validateWithdrawal(
    Planet memory planet,
    address executor,
    MaterialType materialType,
    uint256 materialToWithdraw
  ) internal view {
    if (planet.owner != executor) revert Errors.NotPlanetOwner();
    if (planet.planetType != PlanetType.SPACETIME_RIP) revert Errors.InvalidPlanetType();

    uint256 currentMaterial = planet.getMaterial(materialType);
    if (currentMaterial < materialToWithdraw) revert Errors.InsufficientMaterialOnPlanet();

    uint256 materialCap = planet.getMaterialCap(materialType);
    if (materialCap > materialToWithdraw * 5) revert Errors.WithdrawAmountTooLow();
  }

  function _executeWithdrawal(
    Planet memory planet,
    address executor,
    MaterialType materialType,
    uint256 materialToWithdraw
  ) internal {
    uint256 currentMaterial = planet.getMaterial(materialType);
    uint256 playerWithdrawMaterialAmount = PlayerWithdrawMaterial.get(executor, uint8(materialType));

    // 分数 = 提现数量 × 材料乘数，不再除。银提现是 1:1，见 getBiomeScoreMultiplier。
    uint256 scoreMultiplier = getBiomeScoreMultiplier(materialType);
    uint256 scorePoints = materialToWithdraw * scoreMultiplier;

    // Remove material from planet
    planet.setMaterial(materialType, currentMaterial - materialToWithdraw);

    // Add to player's withdrawn material amount
    playerWithdrawMaterialAmount += materialToWithdraw;

    // Add score points to player's score
    uint256 currentPlayerScore = PlayerScore.get(executor);
    PlayerScore.set(executor, currentPlayerScore + scorePoints);
    DFXStarStakingLib.stakeScoreDelta(executor, scorePoints);

    // Add score points to guild if player is in a guild
    uint8 guildId = GuildUtils.getCurrentGuildId(executor);
    if (guildId != 0) {
      uint256 currentGuildSilver = Guild.getSilver(guildId);
      Guild.setSilver(guildId, currentGuildSilver + scorePoints);
    }

    planet.writeToStore();
    PlayerWithdrawMaterial.set(executor, uint8(materialType), playerWithdrawMaterialAmount);
  }

  /**
   * @notice 材料提现的分数乘数。得分 = 提现数量 × 返回值，结果直接入账，不再除以 10 或 100。
   * @dev 银提现是 1 单位 1 分，而且银可以用代币买。若材料只比银贵几倍，买银再提走就等于付费质押。
   *      这里的地板是 100：同样数量的最便宜材料也值 105 倍银，买来的银因此留作升级。
   *      100 到 600 只是材料之间的风险阶梯，水晶体 105，腐化水晶 600，大约 6 倍，不是相对银的 6 倍。
   *      按材料类型取值，不按生物群系。
   */
  function getBiomeScoreMultiplier(MaterialType materialType) internal pure returns (uint256 multiplier) {
    if (materialType == MaterialType.CORRUPTED_CRYSTAL) {
      multiplier = 600;
    } else if (materialType == MaterialType.BLACKALLOY) {
      multiplier = 400;
    } else if (materialType == MaterialType.PYROSTEEL) {
      multiplier = 300;
    } else if (materialType == MaterialType.SCRAPIUM) {
      multiplier = 250;
    } else if (materialType == MaterialType.CRYOSTONE) {
      multiplier = 200;
    } else if (materialType == MaterialType.SANDGLASS) {
      multiplier = 180;
    } else if (materialType == MaterialType.MYCELIUM) {
      multiplier = 150;
    } else if (materialType == MaterialType.AURORIUM) {
      multiplier = 130;
    } else if (materialType == MaterialType.WINDSTEEL) {
      multiplier = 120;
    } else if (materialType == MaterialType.LIVING_WOOD) {
      multiplier = 110;
    } else if (materialType == MaterialType.WATER_CRYSTALS) {
      multiplier = 105;
    } else {
      // UNKNOWN 以及未单列的材料。地板 100，避免和可购买的银（1 分）挤在同一档。
      multiplier = 100;
    }
  }
}
