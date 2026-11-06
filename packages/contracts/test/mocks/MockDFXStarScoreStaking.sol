// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import { IDFXStarScoreStaking } from "interfaces/nutbox/IDFXStarScoreStaking.sol";

/// @dev Test double for Nutbox DFXStarScoreStaking pool.
contract MockDFXStarScoreStaking is IDFXStarScoreStaking {
  uint256 public totalStaked;
  address public lastDepositUser;
  uint256 public lastDepositAmount;
  uint256 public lastInjectAmount;

  function depositFromGame(address user, uint256 amount) external payable {
    lastDepositUser = user;
    lastDepositAmount = amount;
    totalStaked += amount;
  }

  function injectRewards(uint256 amount) external payable {
    lastInjectAmount = amount;
  }

  function claimExternalRewards() external payable {}

  function getTotalStakedAmount() external view returns (uint256) {
    return totalStaked;
  }

  function getUserStakedAmount(address) external pure returns (uint256) {
    return 0;
  }

  function getPendingExternalRewards(address) external pure returns (uint256) {
    return 0;
  }

  function getPendingCommunityRewards(address) external pure returns (uint256) {
    return 0;
  }

  function getPendingAllRewards(address) external pure returns (uint256, uint256) {
    return (0, 0);
  }
}
