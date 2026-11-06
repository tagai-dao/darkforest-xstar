// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

interface IPoolFactory {
  function createPool(address community, string memory name, bytes calldata meta) external returns (address);
}
