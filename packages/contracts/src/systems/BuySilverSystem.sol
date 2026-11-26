// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { BaseSystem } from "systems/internal/BaseSystem.sol";
import { Planet } from "libraries/Planet.sol";
import { PlanetType } from "codegen/common.sol";
import { PlanetConstants } from "codegen/tables/PlanetConstants.sol";
import { Player } from "codegen/tables/Player.sol";
import { DFXStarConfig } from "codegen/tables/DFXStarConfig.sol";
import { SilverBurnStats } from "codegen/tables/SilverBurnStats.sol";
import { DFUtils } from "libraries/DFUtils.sol";
import { SilverMarket } from "libraries/SilverMarket.sol";
import { IDFXStarScoreStaking } from "interfaces/nutbox/IDFXStarScoreStaking.sol";

/// @notice 买银付款先按 burnBps 拆开：一部分打到销毁地址，剩下的才注入 Nutbox 矿池。
contract BuySilverSystem is BaseSystem {
  using SafeERC20 for IERC20;

  /// @dev 常用销毁地址。代币转到这里就离开流通，合约不再持有。
  address internal constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

  /// @dev 万分比的分母。5000 是一半，10000 是整笔。
  uint256 internal constant BPS_DENOMINATOR = 10_000;

  error UntrustedBuySilverWorld();

  address public immutable trustedWorld;

  constructor(address worldAddress) {
    if (worldAddress.code.length == 0) revert UntrustedBuySilverWorld();
    trustedWorld = worldAddress;
  }

  modifier onlyTrustedWorld() {
    // Authenticate the real caller before using MUD's forwarded player or store context.
    if (msg.sender != trustedWorld) revert UntrustedBuySilverWorld();
    _;
  }

  function quoteBuySilver(
    uint256 planetHash,
    uint8 tier
  ) public view onlyTrustedWorld returns (uint256 price, uint256 silver) {
    return SilverMarket.quote(PlanetConstants.getLevel(bytes32(planetHash)), tier);
  }

  /**
   * @param planetHash 目标星球。等级决定档位，种类和空间加成不改价格和数量。
   * @param tier 0=20%，1=50%，2=80%，3=150% 的星云行星基础银上限
   */
  function buySilver(
    uint256 planetHash,
    uint8 tier
  ) public onlyTrustedWorld requireGamePass entryFee requireSameOwnerAndJunkOwner(planetHash) {
    address pool = DFXStarConfig.getScoreStakingPool();
    if (pool == address(0)) revert DFXStarPoolNotConfigured();

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

    // 向下取整归销毁，多出来的 1 单位进矿池，两笔加起来等于报价。
    uint256 burnAmount = (price * DFXStarConfig.getBurnBps()) / BPS_DENOMINATOR;
    uint256 poolAmount = price - burnAmount;

    // 整笔销毁时矿池收不到代币，不再要求池里已经有人质押。
    if (poolAmount != 0 && IDFXStarScoreStaking(pool).getTotalStakedAmount() == 0) {
      revert NoStakersForBuySilver();
    }

    IERC20 token = IERC20(paymentToken);
    token.safeTransferFrom(executor, address(this), price);
    if (burnAmount != 0) {
      token.safeTransfer(BURN_ADDRESS, burnAmount);
      // 累计销毁量只在真正转走代币时增加，整笔不销毁时不写表。
      SilverBurnStats.setTotalBurned(SilverBurnStats.getTotalBurned() + burnAmount);
    }
    if (poolAmount != 0) {
      token.forceApprove(pool, poolAmount);
      IDFXStarScoreStaking(pool).injectRewards(poolAmount);
    }

    planet.silver += packageSilver;
    planet.writeToStore();
  }
}
