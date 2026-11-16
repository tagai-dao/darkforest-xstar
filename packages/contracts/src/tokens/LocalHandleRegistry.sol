// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IBinanceHandle } from "./IBinanceHandle.sol";

/// @notice 本地的 Binance handle 登记处。配置里的主网登记处没有代码时，由 PostDeploy 部署。
/// @dev 空字符串表示这只钱包没有 handle，保管合约会拒绝质押。
contract LocalHandleRegistry is Ownable, IBinanceHandle {
  mapping(address account => string handle) private _handles;

  constructor() Ownable(msg.sender) {}

  function handleOf(address account) external view returns (string memory) {
    return _handles[account];
  }

  /// @dev 只有部署者能绑定。玩家钱包不能给自己写一个 handle。
  function setHandle(address account, string calldata handle) external onlyOwner {
    _handles[account] = handle;
  }
}
