// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

interface ICommunityFactory {
  function createCommunity(
    bool isMintable,
    address communityToken,
    address communityTokenFactory,
    bytes calldata tokenMeta,
    address rewardCalculator,
    bytes calldata distributionPolicy
  ) external payable returns (address community);
}
