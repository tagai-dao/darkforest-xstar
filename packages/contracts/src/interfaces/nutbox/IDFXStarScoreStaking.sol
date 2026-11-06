// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

/// @notice Minimal interface for TagAI Nutbox DFXStarScoreStaking pool (deployed from TagAI-contract-V2).
interface IDFXStarScoreStaking {
  function depositFromGame(address user, uint256 amount) external payable;

  function injectRewards(uint256 amount) external payable;

  function claimExternalRewards() external payable;

  function getTotalStakedAmount() external view returns (uint256);

  function getUserStakedAmount(address user) external view returns (uint256);

  function getPendingExternalRewards(address user) external view returns (uint256);

  function getPendingCommunityRewards(address user) external view returns (uint256);

  function getPendingAllRewards(address user) external view returns (uint256 communityPending, uint256 externalPending);
}
