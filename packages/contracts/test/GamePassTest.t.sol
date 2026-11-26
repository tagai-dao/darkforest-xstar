// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { WorldResourceIdLib } from "@latticexyz/world/src/WorldResourceId.sol";
import { IWorld } from "../src/codegen/world/IWorld.sol";
import { AiproNftStake } from "../src/tokens/AiproNftStake.sol";
import { IBinanceHandle } from "../src/tokens/IBinanceHandle.sol";
import { GamePassNFT as GamePassNFTTable, Ticker, TempConfigSet, SpawnPlanet, PendingMove } from "../src/codegen/index.sol";
import { Proof } from "../src/lib/SnarkProof.sol";
import { MoveInput, SpawnInput } from "../src/lib/VerificationInput.sol";
import { MoveSystem } from "../src/systems/MoveSystem.sol";
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

  function testStakedPlayerCanRegisterSpawnAndMoveWithBurner() public {
    IWorld world = IWorld(worldAddress);

    vm.expectRevert(Errors.GamePassRequired.selector);
    vm.prank(user1);
    world.df__tick();

    uint256 tokenId = _stake(user1);
    address burner = makeAddr("game session wallet");
    vm.startPrank(admin);
    TempConfigSet.setSkipProofCheck(true);
    if (Ticker.getPaused()) {
      world.df__unpause();
    }
    vm.stopPrank();

    Proof memory proof;
    SpawnInput memory home;
    home.planetHash = 4194292 + 1;
    home.perlin = 1;
    home.radiusSquare = 80000 ** 2;
    vm.startPrank(user1);
    world.df__tick();
    world.df__registerPlayer("staked-player", burner);
    world.df__spawnPlayer(proof, home);
    world.df__addJunk(home.planetHash, 0, proof);
    vm.stopPrank();

    assertEq(SpawnPlanet.get(user1), home.planetHash);

    MoveInput memory move;
    move.fromPlanetHash = home.planetHash;
    move.toPlanetHash = home.planetHash + 1;
    move.toPerlin = home.perlin;
    move.toRadiusSquare = home.radiusSquare;
    move.distance = 20;
    MaterialMove[] memory materials = new MaterialMove[](0);
    bytes memory moveCall = abi.encodeCall(MoveSystem.move, (proof, move, 15000, 0, 0, materials));

    vm.prank(user1);
    world.df__move(proof, move, 15000, 0, 0, materials);
    assertEq(PendingMove.getNumber(bytes32(move.toPlanetHash)), 1);

    vm.prank(burner);
    world.callFrom(user1, WorldResourceIdLib.encode("sy", "df", "MoveSystem"), moveCall);
    assertEq(PendingMove.getNumber(bytes32(move.toPlanetHash)), 2);

    vm.prank(user1);
    locker.withdraw(tokenId);

    vm.expectRevert(Errors.GamePassRequired.selector);
    vm.prank(user1);
    world.df__move(proof, move, 15000, 0, 0, materials);

    vm.expectRevert(Errors.GamePassRequired.selector);
    vm.prank(burner);
    world.callFrom(user1, WorldResourceIdLib.encode("sy", "df", "MoveSystem"), moveCall);
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
