// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.24;

import { BaseSystem } from "systems/internal/BaseSystem.sol";
import { EntryFee } from "codegen/tables/EntryFee.sol";
import { ArtifactWithdrawal } from "codegen/tables/ArtifactWithdrawal.sol";
import { DFXStarConfig } from "codegen/tables/DFXStarConfig.sol";

contract AdminSystem is BaseSystem {
  /**
   * @notice To provide a convenient way for clients to update the entry fee for the game.
   * @param newEntryFee The new entry fee.
   */
  function updateEntryFee(uint256 newEntryFee) public hasAccess {
    EntryFee.set(newEntryFee);
  }

  /**
   * @notice To provide a convenient way for clients to disable artifact withdrawal.
   */
  function disableArtifactWithdrawal() public hasAccess {
    ArtifactWithdrawal.setDisabled(true);
  }

  /// @notice 调整买银销毁的万分比。0 整笔进矿池，10000 整笔销毁。
  function updateSilverBurnBps(uint16 burnBps) public hasAccess {
    if (burnBps > 10_000) revert SilverBurnBpsOutOfRange();
    DFXStarConfig.setBurnBps(burnBps);
  }

  // TODO: move pause, unpause, updateTickerRate to here
}
