// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.24;

interface IGamePassNFT {
  /// @dev 这只钱包当前是否把入场 NFT 放在保管合约里。
  function isPlayerInActiveSeason(address player) external view returns (bool);
}
