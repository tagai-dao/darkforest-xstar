// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.24;

import { DFXStarConfig } from "codegen/tables/DFXStarConfig.sol";
import { Errors } from "interfaces/errors.sol";
import { ICommunity } from "nutbox/interfaces/ICommunity.sol";
import { IPool } from "nutbox/interfaces/IPool.sol";

library DFXStarConfigLib {
  function set(
    address scoreStakingPool,
    address paymentToken,
    address stakingFactory,
    address community,
    address buySilverSystem,
    uint16 burnBps
  ) internal {
    if (paymentToken != address(0)) {
      if (community.code.length == 0) revert Errors.DFXStarCommunityNotConfigured();
      if (ICommunity(community).getCommunityToken() != paymentToken) revert Errors.PaymentTokenCommunityMismatch();

      // The live pool draws rewards in its own community's token.
      if (scoreStakingPool.code.length > 0 && IPool(scoreStakingPool).getCommunity() != community) {
        revert Errors.ScorePoolCommunityMismatch();
      }
    }

    DFXStarConfig.set(scoreStakingPool, paymentToken, stakingFactory, community, buySilverSystem, burnBps);
  }
}
