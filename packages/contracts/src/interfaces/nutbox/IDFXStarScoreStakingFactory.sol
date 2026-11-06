// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.24;

interface IDFXStarScoreStakingFactory {
  function addAdmin(address _admin) external;
  function removeAdmin(address _admin) external;
  function isAdmin(address _admin) external view returns (bool);
}
