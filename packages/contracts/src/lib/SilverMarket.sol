// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.24;

import { Errors } from "interfaces/errors.sol";
import { SilverFrontier } from "codegen/tables/SilverFrontier.sol";

/// @notice 购银报价。数量和原价只看星球等级，对应星云行星的基础银上限。
/// @dev 客户端 packages/client/src/Shared/silverMarket.ts 必须使用同一张表和同一种舍入。
library SilverMarket {
  /// @dev 有人第一次拿到更高等级的星球时推进。0 级出生星、空拥有者、放弃和清垃圾都不改。
  function noteCapture(uint256 level) internal {
    if (level == 0 || level > 9) return;
    uint8 next = uint8(level);
    if (next > SilverFrontier.getLevel()) {
      SilverFrontier.setLevel(next);
    }
  }

  /// @return price 扣过进度折扣后的代币数量，单位 wei
  /// @return silver 加到星球上的银，链上单位（页面数量 × 1000）
  function quote(uint8 level, uint8 tier) internal view returns (uint256 price, uint256 silver) {
    if (tier > 3) revert Errors.InvalidSilverPurchaseTier();
    if (level == 0 || level > 9) revert Errors.InvalidSilverPurchaseLevel();

    uint256 percent = 100;
    uint8 frontier = SilverFrontier.getLevel();
    // 进度还没超过这颗星时保持原价。进度 0 不能减出下溢。
    if (frontier > level) {
      percent = 100 - uint256(frontier - level) * 10;
    }

    // 半个代币进一。(价格 × 百分比 + 50) / 100，和客户端整数算法一致。
    price = ((_basePrice(level, tier) * percent + 50) / 100) * 1 ether;
    silver = _baseSilver(level, tier) * 1000;
  }

  /// @dev 整枚 AIPRO。行是 1 到 9 级，列是 20% / 50% / 80% / 150%。
  function _basePrice(uint8 level, uint8 tier) private pure returns (uint256) {
    uint256[36] memory prices = [
      uint256(1000),
      2500,
      4000,
      7500,
      2500,
      6250,
      10000,
      18750,
      6250,
      15625,
      25000,
      46875,
      15000,
      37500,
      60000,
      112500,
      34000,
      85000,
      135000,
      255000,
      50000,
      125000,
      200000,
      375000,
      75000,
      187500,
      300000,
      562500,
      95000,
      237500,
      380000,
      712500,
      110000,
      275000,
      440000,
      825000
    ];
    return prices[(uint256(level) - 1) * 4 + tier];
  }

  /// @dev 页面上的银。1 级基础上限 100，之后按星云行星基础上限的 20/50/80/150%。
  function _baseSilver(uint8 level, uint8 tier) private pure returns (uint256) {
    uint256[36] memory amounts = [
      uint256(20),
      50,
      80,
      150,
      100,
      250,
      400,
      750,
      500,
      1250,
      2000,
      3750,
      2400,
      6000,
      9600,
      18000,
      10000,
      25000,
      40000,
      75000,
      20000,
      50000,
      80000,
      150000,
      40000,
      100000,
      160000,
      300000,
      60000,
      150000,
      240000,
      450000,
      80000,
      200000,
      320000,
      600000
    ];
    return amounts[(uint256(level) - 1) * 4 + tier];
  }
}
