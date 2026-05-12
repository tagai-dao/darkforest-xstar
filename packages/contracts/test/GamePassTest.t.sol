// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import { IWorld } from "../src/codegen/world/IWorld.sol";
import { GamePassNFT } from "../src/tokens/GamePassNFT.sol";
import { MockGameToken } from "../src/tokens/MockGameToken.sol";
import { GamePassNFT as GamePassNFTTable, Round } from "../src/codegen/index.sol";
import { Errors } from "../src/interfaces/errors.sol";
import { BaseTest } from "./BaseTest.t.sol";

contract GamePassTest is BaseTest {
  MockGameToken token;
  GamePassNFT pass;

  function setUp() public override {
    super.setUp();

    token = new MockGameToken();
    pass = new GamePassNFT(address(token), worldAddress, 100_000 ether);

    vm.prank(admin);
    GamePassNFTTable.set(address(pass));
  }

  function testRegisterRequiresCurrentRoundBoundPass() public {
    vm.expectRevert(Errors.GamePassRequired.selector);
    IWorld(worldAddress).df__registerPlayer("no-pass", address(1));
  }

  function testOwnerMintedPassCanBindAndRegister() public {
    pass.ownerMint(user1);

    vm.startPrank(user1);
    pass.bindToCurrentRound(1);
    IWorld(worldAddress).df__registerPlayer("early", address(1));
    vm.stopPrank();

    assertTrue(pass.isBoundToCurrentRound(user1));
  }

  function testBoundPassCannotTransferUntilRoundAdvancedAndUnbound() public {
    pass.ownerMint(user1);

    vm.startPrank(user1);
    pass.bindToCurrentRound(1);

    vm.expectRevert(GamePassNFT.BoundPassNotTransferable.selector);
    pass.transferFrom(user1, user2, 1);
    vm.stopPrank();

    vm.prank(admin);
    Round.set(2);
    vm.startPrank(user1);
    pass.unbindAfterSeason(1);
    pass.transferFrom(user1, user2, 1);
    vm.stopPrank();

    assertEq(pass.ownerOf(1), user2);
  }

  function testPaidMintCollectsTokenAndAllowsBinding() public {
    token.mint(user1, 100_000 ether);

    vm.startPrank(user1);
    token.approve(address(pass), 100_000 ether);
    uint256 tokenId = pass.buyPass();
    pass.bindToCurrentRound(tokenId);
    IWorld(worldAddress).df__registerPlayer("paid", address(2));
    vm.stopPrank();

    assertEq(token.balanceOf(address(pass)), 100_000 ether);
  }
}
