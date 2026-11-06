// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import "nutbox/interfaces/ICalculator.sol";

/// @notice AIPRO 社区使用的计算器。注入的社区代币按 168 小时线性释放。
interface IHourlyTickCalculator is ICalculator {
  /// @notice 把社区代币注入奖励流。调用前需授权本合约转走社区代币。
  function inject(address community, uint256 amount) external;

  function getHourlyRewards(
    address community,
    uint256 startTimestamp,
    uint256 numHours
  ) external view returns (uint256[] memory rewards);
}
