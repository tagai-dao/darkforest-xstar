// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

interface ICalculator {
  function rewardHead() external view returns (uint256);

  function calculateReward(address staking, uint256 lastCursor, uint256 head) external view returns (uint256);

  function setDistributionEra(address staking, bytes calldata policy) external returns (bool);

  function getCurrentRewardRate(address staking) external view returns (uint256);

  function getStartCursor(address staking) external view returns (uint256);
}
