// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import { IWorld } from "../src/codegen/world/IWorld.sol";
import { GamePassNFT } from "../src/tokens/GamePassNFT.sol";
import { MockGameToken } from "../src/tokens/MockGameToken.sol";
import { GamePassNFT as GamePassNFTTable } from "../src/codegen/index.sol";
import { Errors } from "../src/interfaces/errors.sol";
import { BaseTest } from "./BaseTest.t.sol";

contract GamePassTest is BaseTest {
  MockGameToken token;
  GamePassNFT pass;

  function setUp() public override {
    super.setUp();

    token = new MockGameToken();
    pass = new GamePassNFT(address(token), 100_000 ether);

    vm.startPrank(admin);
    GamePassNFTTable.set(address(pass));
    pass.setActiveSeason(worldAddress, 1);
    vm.stopPrank();
  }

  function testRegisterRequiresJoinedPass() public {
    vm.expectRevert(Errors.GamePassRequired.selector);
    IWorld(worldAddress).df__registerPlayer("no-pass", address(1));
  }

  function testJoinSeasonAllowsRegister() public {
    pass.ownerMint(user1);

    vm.startPrank(user1);
    pass.joinSeason(1);
    IWorld(worldAddress).df__registerPlayer("early", address(1));
    vm.stopPrank();

    assertTrue(pass.isPlayerInActiveSeason(user1));
  }

  function testInGamePassCannotTransferOrUnbind() public {
    pass.ownerMint(user1);

    vm.startPrank(user1);
    pass.joinSeason(1);

    vm.expectRevert(GamePassNFT.BoundPassNotTransferable.selector);
    pass.transferFrom(user1, user2, 1);

    vm.expectRevert(GamePassNFT.PassInActiveSeason.selector);
    pass.unbind(1);
    vm.stopPrank();
  }

  function testClearActiveSeasonAllowsUnbindAndTransfer() public {
    pass.ownerMint(user1);

    vm.startPrank(user1);
    pass.joinSeason(1);
    vm.stopPrank();

    vm.prank(admin);
    pass.clearActiveSeason();

    vm.startPrank(user1);
    pass.unbind(1);
    pass.transferFrom(user1, user2, 1);
    vm.stopPrank();

    assertEq(pass.ownerOf(1), user2);
    assertEq(pass.tokenBoundWorld(1), address(0));
    assertEq(pass.tokenBoundSeason(1), 0);
  }

  function testNewActiveSeasonRequiresRejoin() public {
    pass.ownerMint(user1);

    vm.startPrank(user1);
    pass.joinSeason(1);
    vm.stopPrank();

    vm.prank(admin);
    pass.setActiveSeason(worldAddress, 2);

    assertFalse(pass.isPlayerInActiveSeason(user1));

    vm.startPrank(user1);
    pass.joinSeason(1);
    vm.stopPrank();

    assertTrue(pass.isPlayerInActiveSeason(user1));
    assertEq(pass.tokenBoundSeason(1), 2);
  }

  function testJoinSeasonIsIdempotentWhenAlreadyInGame() public {
    pass.ownerMint(user1);

    vm.startPrank(user1);
    pass.joinSeason(1);
    pass.joinSeason(1);
    vm.stopPrank();

    assertTrue(pass.isTokenInGame(1));
    assertEq(pass.seasonPlayerToken(worldAddress, 1, user1), 1);
  }

  function testSecondTokenCannotJoinSameSeasonForSamePlayer() public {
    pass.ownerMint(user1);
    pass.ownerMint(user1);

    vm.startPrank(user1);
    pass.joinSeason(1);

    vm.expectRevert(GamePassNFT.PlayerAlreadyJoined.selector);
    pass.joinSeason(2);
    vm.stopPrank();
  }

  function testPaidMintCollectsTokenAndAllowsJoin() public {
    token.mint(user1, 100_000 ether);

    vm.startPrank(user1);
    token.approve(address(pass), 100_000 ether);
    uint256 tokenId = pass.buyPass();
    pass.joinSeason(tokenId);
    IWorld(worldAddress).df__registerPlayer("paid", address(2));
    vm.stopPrank();

    assertEq(token.balanceOf(address(pass)), 100_000 ether);
    assertTrue(pass.isPlayerInActiveSeason(user1));
  }

  function testUnboundPassCanTransferWhenSeasonClosed() public {
    pass.ownerMint(user1);

    vm.prank(user1);
    pass.transferFrom(user1, user2, 1);

    assertEq(pass.ownerOf(1), user2);
  }

  function testJoinSeasonRevertsWhenSeasonNotOpen() public {
    vm.prank(admin);
    pass.clearActiveSeason();

    pass.ownerMint(user1);

    vm.prank(user1);
    vm.expectRevert(GamePassNFT.SeasonNotOpen.selector);
    pass.joinSeason(1);
  }
}
