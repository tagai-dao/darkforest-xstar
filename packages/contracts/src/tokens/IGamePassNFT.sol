// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.24;

interface IGamePassNFT {
  function isBoundToCurrentRound(address player) external view returns (bool);
}
