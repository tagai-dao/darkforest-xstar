// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.24;

import { System } from "@latticexyz/world/src/System.sol";
import { Systems } from "@latticexyz/world/src/codegen/tables/Systems.sol";
import { ResourceId } from "@latticexyz/store/src/ResourceId.sol";

import { DFXStarConfig } from "codegen/tables/DFXStarConfig.sol";
import { Errors } from "interfaces/errors.sol";
import { IDFXStarScoreStaking } from "interfaces/nutbox/IDFXStarScoreStaking.sol";
import { DFUtils, PLANET_WITHDRAW_SILVER_SYSTEM_NAME, WITHDRAW_MATERIAL_SYSTEM_NAME } from "libraries/DFUtils.sol";

/// @notice 在 World 里执行的记分入口。df 里的系统是普通调用，直接打到积分池时调用方不是 World。
contract StakeScoreSystem is System, Errors {
  /// @dev 由提取白银或提取材料系统通过 World.call 进入。池子看到的 msg.sender 是 World。
  function stake(address user, uint256 delta) public {
    address caller = _msgSender();
    if (!_isWithdrawSystem(caller)) revert NotScoreStakeCaller();
    if (delta == 0) return;

    address pool = DFXStarConfig.getScoreStakingPool();
    if (pool == address(0)) return;

    IDFXStarScoreStaking(pool).depositFromGame(user, delta);
  }

  function _isWithdrawSystem(address caller) internal view returns (bool) {
    ResourceId silverId = DFUtils.getSystemResourceId(PLANET_WITHDRAW_SILVER_SYSTEM_NAME);
    ResourceId materialId = DFUtils.getSystemResourceId(WITHDRAW_MATERIAL_SYSTEM_NAME);
    return caller == Systems.getSystem(silverId) || caller == Systems.getSystem(materialId);
  }
}
