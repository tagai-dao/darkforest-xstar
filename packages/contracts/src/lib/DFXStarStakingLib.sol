// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.24;

import { IBaseWorld } from "@latticexyz/world/src/codegen/interfaces/IBaseWorld.sol";
import { WorldResourceIdLib } from "@latticexyz/world/src/WorldResourceId.sol";
import { RESOURCE_SYSTEM } from "@latticexyz/world/src/worldResourceTypes.sol";
import { StoreSwitch } from "@latticexyz/store/src/StoreSwitch.sol";
import { ResourceId } from "@latticexyz/store/src/ResourceId.sol";

import { DFXStarConfig } from "codegen/tables/DFXStarConfig.sol";
import { StakeScoreSystem } from "systems/StakeScoreSystem.sol";

bytes16 constant STAKE_SCORE_SYSTEM_NAME = "StakeScoreSystem";

/// @dev 把本次新增的分数交给 World 里的根系统，再由它调用积分池。
library DFXStarStakingLib {
  function stakeScoreSystemId() internal pure returns (ResourceId) {
    return
      WorldResourceIdLib.encode({ typeId: RESOURCE_SYSTEM, namespace: bytes14(""), name: STAKE_SCORE_SYSTEM_NAME });
  }

  function stakeScoreDelta(address user, uint256 delta) internal {
    if (delta == 0) return;
    if (DFXStarConfig.getScoreStakingPool() == address(0)) return;

    // 从 df 系统里读到的 store 就是 World。根系统用 delegatecall 执行，积分池才会把调用方认成 World。
    IBaseWorld(StoreSwitch.getStoreAddress()).call(
      stakeScoreSystemId(),
      abi.encodeCall(StakeScoreSystem.stake, (user, delta))
    );
  }
}
