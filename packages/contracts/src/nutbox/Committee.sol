// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "nutbox/interfaces/ICommittee.sol";

contract Committee is ICommittee, Ownable2Step {
  address payable private feeRecipient = payable(0x06Deb72b2e156Ddd383651aC3d2dAb5892d9c048);

  uint256 private createCommunityFee = 500000000000000;
  uint256 private communitySettingsFee = 500000000000000;
  uint256 private poolOperationFee = 500000000000000;

  mapping(address => bool) private whitelistContracts;
  mapping(address => bool) private feeFreeList;

  event AdminSetFeeRecipient(address indexed feeRecipient);
  event AdminSetCreateCommunityFee(uint256 fee);
  event AdminSetCommunitySettingsFee(uint256 fee);
  event AdminSetPoolOperationFee(uint256 fee);
  event AdminAddContract(address indexed c);
  event AdminRemoveContract(address indexed c);
  event AdminAddFeeFreeAddress(address indexed feeFree);
  event AdminRemoveFeeFreeAddress(address indexed feeFree);

  constructor(address payable _feeRecipient) Ownable(_feeRecipient) {
    require(_feeRecipient != address(0), "Invalid feeRecipient");
    feeRecipient = _feeRecipient;
    emit AdminSetFeeRecipient(_feeRecipient);
  }

  function adminSetFeeRecipient(address payable _feeRecipient) external onlyOwner {
    require(_feeRecipient != address(0), "Invalid feeRecipient");
    feeRecipient = _feeRecipient;
    emit AdminSetFeeRecipient(_feeRecipient);
  }

  function adminSetCreateCommunityFee(uint256 _fee) external onlyOwner {
    createCommunityFee = _fee;
    emit AdminSetCreateCommunityFee(_fee);
  }

  function adminSetCommunitySettingsFee(uint256 _fee) external onlyOwner {
    communitySettingsFee = _fee;
    emit AdminSetCommunitySettingsFee(_fee);
  }

  function adminSetPoolOperationFee(uint256 _fee) external onlyOwner {
    poolOperationFee = _fee;
    emit AdminSetPoolOperationFee(_fee);
  }

  function adminAddContract(address _c) external onlyOwner {
    whitelistContracts[_c] = true;
    emit AdminAddContract(_c);
  }

  function adminRemoveContract(address _c) external onlyOwner {
    whitelistContracts[_c] = false;
    emit AdminRemoveContract(_c);
  }

  function adminAddFeeFreeAddress(address _f) external onlyOwner {
    feeFreeList[_f] = true;
    emit AdminAddFeeFreeAddress(_f);
  }

  function adminRemoveFeeFreeAddress(address _f) external onlyOwner {
    feeFreeList[_f] = false;
    emit AdminRemoveFeeFreeAddress(_f);
  }

  function getFeeRecipient() external view override returns (address payable) {
    return feeRecipient;
  }

  function getCreateCommunityFee() external view override returns (uint256) {
    return createCommunityFee;
  }

  function getCommunitySettingsFee() external view override returns (uint256) {
    return communitySettingsFee;
  }

  function getPoolOperationFee() external view override returns (uint256) {
    return poolOperationFee;
  }

  function verifyContract(address c) external view override returns (bool) {
    return whitelistContracts[c];
  }

  function getFeeFree(address freeAddress) external view override returns (bool) {
    return feeFreeList[freeAddress];
  }
}
