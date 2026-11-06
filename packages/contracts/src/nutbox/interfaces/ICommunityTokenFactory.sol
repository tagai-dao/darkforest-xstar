// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

interface ICommunityTokenFactory {
  function createCommunityToken(bytes calldata meta) external returns (address);
}
