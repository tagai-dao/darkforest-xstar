// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import { Test } from "forge-std/Test.sol";
import { StoreCore } from "@latticexyz/store/src/StoreCore.sol";
import { SystemRegistry } from "@latticexyz/world/src/codegen/tables/SystemRegistry.sol";
import { ResourceAccess } from "@latticexyz/world/src/codegen/tables/ResourceAccess.sol";
import { WorldResourceIdLib } from "@latticexyz/world/src/WorldResourceId.sol";
import { GamePassNFT } from "codegen/tables/GamePassNFT.sol";
import { PlanetFlags } from "codegen/tables/PlanetFlags.sol";
import { Errors } from "interfaces/errors.sol";
import { TickSystem } from "systems/internal/TickSystem.sol";

contract NutboxTestPass {
  function isPlayerInActiveSeason(address player) external pure returns (bool) {
    return player == address(0xA11CE);
  }
}

contract NutboxGamePassPolicyTest is Test, TickSystem {
  address private constant TICKET_HOLDER = address(0xA11CE);
  address private constant UNRELATED_SYSTEM = address(0x7117);
  address private constant PLAYER_WITHOUT_PASS = address(0xB0B);

  function setUp() public {
    StoreCore.initialize();
    StoreCore.registerInternalTables();
    GamePassNFT.register();
    SystemRegistry.register();
    ResourceAccess.register();
    GamePassNFT.set(address(new NutboxTestPass()));
  }

  function checkPass(address player) external view {
    _requireGamePass(player);
  }

  function checkUpdatePass(address caller, bool readingPlanet) external view {
    _requireGamePassForUpdate(caller, readingPlanet);
  }

  function testGamePassRejectsPlayerWithoutPass() public {
    vm.expectRevert(Errors.GamePassRequired.selector);
    this.checkPass(PLAYER_WITHOUT_PASS);
  }

  function testGamePassAcceptsTicketHolder() public view {
    this.checkPass(TICKET_HOLDER);
  }

  function testGamePassDoesNotExemptUnrelatedRegistryEntry() public {
    // A local fixture row isolates the gate without registering a system or performing a game action.
    SystemRegistry.set(UNRELATED_SYSTEM, WorldResourceIdLib.encode("sy", "thirdparty", "MoveSystem"));
    vm.expectRevert(Errors.GamePassRequired.selector);
    this.checkPass(UNRELATED_SYSTEM);
    vm.expectRevert(Errors.GamePassRequired.selector);
    this.checkUpdatePass(UNRELATED_SYSTEM, false);
    vm.expectRevert(Errors.GamePassRequired.selector);
    this.checkUpdatePass(UNRELATED_SYSTEM, true);
  }

  function testOnlyGameSystemsThatCallUpdatesCanBypassGamePass() public {
    SystemRegistry.set(UNRELATED_SYSTEM, WorldResourceIdLib.encode("sy", "df", "GPTTokensSystem"));
    vm.expectRevert(Errors.GamePassRequired.selector);
    this.checkUpdatePass(UNRELATED_SYSTEM, false);
    vm.expectRevert(Errors.GamePassRequired.selector);
    this.checkUpdatePass(UNRELATED_SYSTEM, true);

    SystemRegistry.set(UNRELATED_SYSTEM, WorldResourceIdLib.encode("sy", "df", "MoveSystem"));
    this.checkUpdatePass(UNRELATED_SYSTEM, false);
    this.checkUpdatePass(UNRELATED_SYSTEM, true);
    vm.expectRevert(Errors.GamePassRequired.selector);
    this.checkPass(UNRELATED_SYSTEM);
  }

  function testPlayerSystemCanOnlyBypassGamePassForPlanetSync() public {
    SystemRegistry.set(UNRELATED_SYSTEM, WorldResourceIdLib.encode("sy", "df", "PlayerSystem"));
    this.checkUpdatePass(UNRELATED_SYSTEM, true);
    vm.expectRevert(Errors.GamePassRequired.selector);
    this.checkUpdatePass(UNRELATED_SYSTEM, false);
  }

  function testOnlyInstalledPinkBombCanBypassGamePassForTick() public {
    SystemRegistry.set(UNRELATED_SYSTEM, WorldResourceIdLib.encode("sy", "atf.1", "ProxySystem"));
    vm.expectRevert(Errors.GamePassRequired.selector);
    this.checkUpdatePass(UNRELATED_SYSTEM, false);

    ResourceAccess.set(PlanetFlags._tableId, UNRELATED_SYSTEM, true);
    this.checkUpdatePass(UNRELATED_SYSTEM, false);
    vm.expectRevert(Errors.GamePassRequired.selector);
    this.checkUpdatePass(UNRELATED_SYSTEM, true);
  }
}
