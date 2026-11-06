// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

interface IPool {
  function getUserStakedAmount(address user) external view returns (uint256);
  function getTotalStakedAmount() external view returns (uint256);
  function getFactory() external view returns (address);
  function getCommunity() external view returns (address);
}
