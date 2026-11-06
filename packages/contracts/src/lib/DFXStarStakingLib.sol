// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.24;

import { DFXStarConfig } from "codegen/tables/DFXStarConfig.sol";
import { IDFXStarScoreStaking } from "interfaces/nutbox/IDFXStarScoreStaking.sol";

/// @dev Bridges game score withdrawals to Nutbox virtual score staking (incremental delta only).
library DFXStarStakingLib {
  function stakeScoreDelta(address user, uint256 delta) internal {
    if (delta == 0) return;

    address pool = DFXStarConfig.getScoreStakingPool();
    if (pool == address(0)) return;

    IDFXStarScoreStaking(pool).depositFromGame(user, delta);
  }
}
