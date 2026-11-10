// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.24;

/// @notice Binance Agent ID。handle 绑在地址上，空字符串表示这只钱包没有。
interface IBinanceHandle {
  function handleOf(address owner) external view returns (string memory);
}
