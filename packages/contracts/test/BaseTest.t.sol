// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import { MudTest } from "@latticexyz/world/test/MudTest.t.sol";
import { EntryFee, GamePassNFT } from "codegen/index.sol";

contract BaseTest is MudTest {
  address admin = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
  address user1 = address(1);
  address user2 = address(2);

  bytes14 constant DF_NAMESPACE = "df";

  function setUp() public virtual override {
    super.setUp();
    vm.startPrank(admin);
    // set entry fee to 0 for easy testing
    EntryFee.set(0);
    // Existing tests exercise legacy registration unless they explicitly opt into pass gating.
    GamePassNFT.set(address(0));
    vm.stopPrank();
  }
}
