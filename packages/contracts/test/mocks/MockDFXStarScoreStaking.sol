// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import { IDFXStarScoreStaking } from "interfaces/nutbox/IDFXStarScoreStaking.sol";

/// @dev Test double for Nutbox DFXStarScoreStaking pool.
contract MockDFXStarScoreStaking is IDFXStarScoreStaking {
  address public override world;
  uint256 public totalStaked;
  address public lastDepositUser;
  address public lastDepositSender;
  uint256 public lastDepositAmount;
  uint256 public lastInjectAmount;

  constructor(address boundWorld) {
    world = boundWorld;
  }

  function depositFromGame(address user, uint256 amount) external payable {
    lastDepositSender = msg.sender;
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
