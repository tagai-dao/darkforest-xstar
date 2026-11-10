// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { IWorld } from "../src/codegen/world/IWorld.sol";
import { AiproNftStake } from "../src/tokens/AiproNftStake.sol";
import { IBinanceHandle } from "../src/tokens/IBinanceHandle.sol";
import { GamePassNFT as GamePassNFTTable } from "../src/codegen/index.sol";
import { Errors } from "../src/interfaces/errors.sol";
import { BaseTest } from "./BaseTest.t.sol";

contract TestAiproNft is ERC721 {
  uint256 public nextId = 1;

  constructor() ERC721("AIPRO", "AIPRO") {}

  function mint(address to) external returns (uint256 tokenId) {
    tokenId = nextId++;
    _mint(to, tokenId);
  }
}

contract TestHandleRegistry is IBinanceHandle {
  mapping(address => string) public handleOf;

  function setHandle(address who, string calldata handle) external {
    handleOf[who] = handle;
  }
}

contract GamePassTest is BaseTest {
  TestAiproNft nft;
  TestHandleRegistry handles;
  AiproNftStake locker;

  function setUp() public override {
    super.setUp();

    nft = new TestAiproNft();
    handles = new TestHandleRegistry();
    locker = new AiproNftStake(address(nft), address(handles));

    vm.startPrank(admin);
    GamePassNFTTable.set(address(locker));
    locker.setActiveSeason(worldAddress, 1);
    vm.stopPrank();
  }

  function testRegisterRequiresStakedNft() public {
    vm.expectRevert(Errors.GamePassRequired.selector);
    IWorld(worldAddress).df__registerPlayer("no-pass", address(1));
  }

  function testStakeWithoutHandleReverts() public {
    uint256 tokenId = nft.mint(user1);

    vm.startPrank(user1);
    nft.approve(address(locker), tokenId);
    vm.expectRevert(AiproNftStake.NoBinanceHandle.selector);
    locker.stake(tokenId);
    vm.stopPrank();
  }

  function testStakeAllowsRegisterAndBlocksWithdraw() public {
    uint256 tokenId = _stake(user1);

    vm.prank(user1);
    IWorld(worldAddress).df__registerPlayer("early", address(1));

    assertTrue(locker.isPlayerInActiveSeason(user1));
    assertEq(nft.ownerOf(tokenId), address(locker));

    vm.prank(user1);
    vm.expectRevert(AiproNftStake.StillInRound.selector);
    locker.withdraw(tokenId);
  }

  function testClearSeasonAllowsWithdraw() public {
    uint256 tokenId = _stake(user1);

    vm.prank(admin);
    locker.clearActiveSeason();

    vm.prank(user1);
    locker.withdraw(tokenId);

    assertEq(nft.ownerOf(tokenId), user1);
    assertEq(locker.stakerOf(tokenId), address(0));
    assertFalse(locker.isPlayerInActiveSeason(user1));
  }

  function testNewSeasonRequiresStakeAgain() public {
    uint256 tokenId = _stake(user1);

    vm.prank(admin);
    locker.setActiveSeason(worldAddress, 2);

    assertFalse(locker.isPlayerInActiveSeason(user1));

    // 轮次已经换成 2，上一轮的 NFT 可以取回。
    vm.prank(user1);
    locker.withdraw(tokenId);
    assertEq(nft.ownerOf(tokenId), user1);

    vm.startPrank(user1);
    nft.approve(address(locker), tokenId);
    locker.stake(tokenId);
    vm.stopPrank();

    assertTrue(locker.isPlayerInActiveSeason(user1));
    assertEq(locker.tokenBoundSeason(tokenId), 2);
  }

  function testSecondTokenCannotStakeInSameRound() public {
    _stake(user1);
    uint256 second = nft.mint(user1);

    vm.startPrank(user1);
    nft.approve(address(locker), second);
    vm.expectRevert(AiproNftStake.PlayerAlreadyStaked.selector);
    locker.stake(second);
    vm.stopPrank();
  }

  function testStakeRevertsWhenSeasonClosed() public {
    vm.prank(admin);
    locker.clearActiveSeason();

    uint256 tokenId = nft.mint(user1);
    handles.setHandle(user1, "early");

    vm.startPrank(user1);
    nft.approve(address(locker), tokenId);
    vm.expectRevert(AiproNftStake.SeasonNotOpen.selector);
    locker.stake(tokenId);
    vm.stopPrank();
  }

  function _stake(address player) internal returns (uint256 tokenId) {
    tokenId = nft.mint(player);
    handles.setHandle(player, "early");
    vm.startPrank(player);
    nft.approve(address(locker), tokenId);
    locker.stake(tokenId);
    vm.stopPrank();
  }
}
