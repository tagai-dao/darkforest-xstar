// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.24;

import { System } from "@latticexyz/world/src/System.sol";
import { IBaseWorld } from "@latticexyz/world/src/codegen/interfaces/IBaseWorld.sol";
import { WorldResourceIdInstance } from "@latticexyz/world/src/WorldResourceId.sol";
import { AccessControl } from "@latticexyz/world/src/AccessControl.sol";
import { SystemRegistry } from "@latticexyz/world/src/codegen/tables/SystemRegistry.sol";
import { EntryFee } from "codegen/tables/EntryFee.sol";
import { FeeRecipient } from "codegen/tables/FeeRecipient.sol";
import { Errors } from "interfaces/errors.sol";
import { RevenueStats } from "codegen/tables/RevenueStats.sol";
import { ResourceId } from "@latticexyz/store/src/ResourceId.sol";
import { JunkConfig } from "codegen/tables/JunkConfig.sol";
import { PlanetOwner } from "codegen/tables/PlanetOwner.sol";
import { PlanetJunkOwner } from "codegen/tables/PlanetJunkOwner.sol";
import { GamePassNFT } from "codegen/tables/GamePassNFT.sol";
import { IGamePassNFT } from "tokens/IGamePassNFT.sol";

contract BaseSystem is System, Errors {
  /**
   * @dev Used to ensure that the system is called with the correct entry fee.
   * We could not implement this via system hooks because hooks won't be given the msg.value.
   */
  modifier entryFee() {
    uint256 fee = EntryFee.getFee();
    uint256 payment = _msgValue();
    if (payment < fee) revert InsufficientEntryFee(fee);
    _;
    _collectNativeFee(payment, true);
  }

  function _collectNativeFee(uint256 payment, bool recordRevenue) internal {
    if (recordRevenue) {
      bytes32 key = ResourceId.unwrap(SystemRegistry.get(address(this)));
      RevenueStats.set(key, RevenueStats.get(key) + payment);
    }

    if (payment == 0) return;
    address recipient = FeeRecipient.getRecipient();
    if (recipient == address(0)) return;

    // MUD credited this call's value to df before dispatching the system.
    ResourceId namespaceId = WorldResourceIdInstance.getNamespaceId(FeeRecipient._tableId);
    IBaseWorld(_world()).transferBalanceToAddress(namespaceId, recipient, payment);
  }

  /**
   * @dev Used to ensure that the system is called by the namespace owner.
   */
  modifier namespaceOwner() {
    AccessControl.requireOwner(SystemRegistry.get(address(this)), _msgSender());
    _;
  }

  /**
   * @dev Used to ensure that the system is called by a user with access to the namespace
   * or this system.
   * @notice It equals to make a system with close access.
   */
  modifier hasAccess() {
    AccessControl.requireAccess(SystemRegistry.get(address(this)), _msgSender());
    _;
  }

  modifier requireGamePass() {
    _requireGamePass(_msgSender());
    _;
  }

  function _requireGamePass(address player) internal view {
    _checkGamePass(GamePassNFT.get(), player);
  }

  function _checkGamePass(address pass, address player) internal view {
    if (pass != address(0) && !IGamePassNFT(pass).isPlayerInActiveSeason(player)) revert GamePassRequired();
  }

  modifier requireSameOwnerAndJunkOwner(uint256 planetHash) {
    if (JunkConfig.getSPACE_JUNK_ENABLED()) {
      if (PlanetOwner.get(bytes32(planetHash)) != PlanetJunkOwner.get(bytes32(planetHash))) {
        revert NotSameOwnerAndJunkOwner();
      }
    }
    _;
  }

  // TODO: move planet and artifact read/write to here as internal functions
  // TODO: move verify to here as internal function
  // TODO: new an admin system for admin actions including pause/unpause, setEntryFee, etc.
  // TODO: remove any external functions except the tick from the tick system
  // TODO: create some frequently used modifiers, like requireOwner, requirePlanetOwner, etc.
  // TODO: use readable string errors instead of custom errors
  // TODO: fix possible issues lying in ArtifactStorage.push
}
