// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { BaseSystem } from "systems/internal/BaseSystem.sol";
import { Planet } from "libraries/Planet.sol";
import { PlanetType } from "codegen/common.sol";
import { Player } from "codegen/tables/Player.sol";
import { DFXStarConfig } from "codegen/tables/DFXStarConfig.sol";
import { DFUtils } from "libraries/DFUtils.sol";
import { SilverMarket } from "libraries/SilverMarket.sol";
import { IDFXStarScoreStaking } from "interfaces/nutbox/IDFXStarScoreStaking.sol";

/// @notice Purchase silver packages on non–spacetime-rip planets; payment injects Nutbox DFXStar pool rewards.
contract BuySilverSystem is BaseSystem {
  using SafeERC20 for IERC20;

  /**
   * @param planetHash 目标星球。等级决定档位，种类和空间加成不改价格和数量。
   * @param tier 0=20%，1=50%，2=80%，3=150% 的星云行星基础银上限
   */
  function buySilver(uint256 planetHash, uint8 tier) public entryFee requireSameOwnerAndJunkOwner(planetHash) {
    address pool = DFXStarConfig.getScoreStakingPool();
    if (pool == address(0)) revert DFXStarPoolNotConfigured();

    if (IDFXStarScoreStaking(pool).getTotalStakedAmount() == 0) {
      revert NoStakersForBuySilver();
    }

    address paymentToken = DFXStarConfig.getPaymentToken();
    if (paymentToken == address(0)) revert PaymentTokenNotConfigured();

    address executor = _msgSender();
    if (Player.getIndex(executor) == 0) revert NotRegistered();

    address worldAddress = _world();
    DFUtils.tick(worldAddress);

    Planet memory planet = DFUtils.readInitedPlanet(worldAddress, planetHash);

    if (planet.owner != executor) revert NotPlanetOwner();
    if (planet.planetType == PlanetType.SPACETIME_RIP) revert BuySilverOnSpacetimeRip();
    if (planet.junkOwner != executor || planet.addJunkTick == 0) revert NotJunkOwner();

    (uint256 price, uint256 packageSilver) = SilverMarket.quote(uint8(planet.level), tier);

    if (planet.silverCap < planet.silver + packageSilver) {
      revert InsufficientPlanetSilverCapacity();
    }

    IERC20 token = IERC20(paymentToken);
    token.safeTransferFrom(executor, address(this), price);
    token.forceApprove(pool, price);
    IDFXStarScoreStaking(pool).injectRewards(price);

    planet.silver += packageSilver;
    planet.writeToStore();
  }
}
