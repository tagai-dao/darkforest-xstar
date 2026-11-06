// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

interface ICommittee {
  function getCreateCommunityFee() external view returns (uint256);
  function getCommunitySettingsFee() external view returns (uint256);
  function getPoolOperationFee() external view returns (uint256);
  function getFeeRecipient() external view returns (address payable);
  function verifyContract(address factory) external view returns (bool);
  function adminAddContract(address _c) external;
  function getFeeFree(address freeAddress) external view returns (bool);
}
