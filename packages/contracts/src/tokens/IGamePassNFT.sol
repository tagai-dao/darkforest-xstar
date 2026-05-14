// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.24;

interface IGamePassNFT {
  function activeWorld() external view returns (address);

  function activeSeason() external view returns (uint8);

  function isSeasonOpen() external view returns (bool);

  function isPlayerInActiveSeason(address player) external view returns (bool);
}
