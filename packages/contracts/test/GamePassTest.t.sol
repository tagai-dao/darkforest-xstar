// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { IWorld } from "../src/codegen/world/IWorld.sol";
import { AiproNftStake } from "../src/tokens/AiproNftStake.sol";
import { IBinanceHandle } from "../src/tokens/IBinanceHandle.sol";
import { GamePassNFT as GamePassNFTTable, Ticker, TempConfigSet } from "../src/codegen/index.sol";
import { PlanetType, SpaceType } from "../src/codegen/common.sol";
import { Proof } from "../src/lib/SnarkProof.sol";
import { MoveInput } from "../src/lib/VerificationInput.sol";
import { MaterialMove } from "../src/lib/Material.sol";
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

    vm.prank(admin);
    GamePassNFTTable.set(address(locker));
  }

  function testRegisterRequiresStakedNft() public {
    vm.expectRevert(Errors.GamePassRequired.selector);
    vm.prank(user1);
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

  function testWithdrawAnytimeThenOperationsStop() public {
    uint256 tokenId = _stake(user1);

    vm.prank(user1);
    IWorld(worldAddress).df__registerPlayer("early", address(1));
    assertTrue(locker.isPlayerInActiveSeason(user1));
    assertEq(nft.ownerOf(tokenId), address(locker));

    vm.prank(user1);
    locker.withdraw(tokenId);

    assertEq(nft.ownerOf(tokenId), user1);
    assertFalse(locker.isPlayerInActiveSeason(user1));

    vm.expectRevert(Errors.GamePassRequired.selector);
    vm.prank(user1);
    IWorld(worldAddress).df__changePlayerName("later");

    vm.startPrank(user1);
    nft.approve(address(locker), tokenId);
    locker.stake(tokenId);
    IWorld(worldAddress).df__changePlayerName("later");
    vm.stopPrank();
  }

  function testSecondTokenCannotStake() public {
    _stake(user1);
    uint256 second = nft.mint(user1);

    vm.startPrank(user1);
    nft.approve(address(locker), second);
    vm.expectRevert(AiproNftStake.PlayerAlreadyStaked.selector);
    locker.stake(second);
    vm.stopPrank();
  }

  function testMoveUsesStakeAndInternalTickStillRuns() public {
    vm.expectRevert(Errors.GamePassRequired.selector);
    vm.prank(user1);
    IWorld(worldAddress).df__tick();

    _stake(user1);
    vm.startPrank(admin);
    TempConfigSet.setSkipProofCheck(true);
    if (Ticker.getPaused()) {
      IWorld(worldAddress).df__unpause();
    }
    IWorld(worldAddress).df__createPlanet(1, user1, 0, 1, PlanetType.PLANET, SpaceType.NEBULA, 300000, 10000, 0);
    IWorld(worldAddress).df__createPlanet(2, user2, 0, 1, PlanetType.PLANET, SpaceType.NEBULA, 200000, 10000, 0);
    vm.stopPrank();

    vm.prank(user1);
    IWorld(worldAddress).df__tick();

    Proof memory proof;
    MoveInput memory input;
    input.fromPlanetHash = 1;
    input.toPlanetHash = 2;
    input.distance = 80;
    vm.prank(user1);
    IWorld(worldAddress).df__move(proof, input, 100000, 1000, 0, new MaterialMove[](0));

    uint256 tokenId = locker.stakedTokenOf(user1);
    vm.prank(user1);
    locker.withdraw(tokenId);

    vm.expectRevert(Errors.GamePassRequired.selector);
    vm.prank(user1);
    IWorld(worldAddress).df__move(proof, input, 100000, 1000, 0, new MaterialMove[](0));
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
