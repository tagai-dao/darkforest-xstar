// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import { Test } from "forge-std/Test.sol";
import { LocalAiproNft } from "../src/tokens/LocalAiproNft.sol";
import { LocalHandleRegistry } from "../src/tokens/LocalHandleRegistry.sol";
import { MockPaymentToken } from "./mocks/MockPaymentToken.sol";

contract LocalAiproNftTest is Test {
  LocalAiproNft internal nft;
  LocalHandleRegistry internal handles;
  MockPaymentToken internal aipro;
  address internal player = address(0xBEEF);

  receive() external payable {}

  function setUp() public {
    aipro = new MockPaymentToken();
    handles = new LocalHandleRegistry();
    nft = new LocalAiproNft(address(aipro), address(handles));
    aipro.mint(player, 100_000 ether);
    vm.deal(player, 1 ether);
  }

  function testMintChargesAiproAndNativeFee() public {
    handles.setHandle(player, "tester");
    uint256 ownerEth = address(this).balance;

    vm.startPrank(player);
    aipro.approve(address(nft), nft.communityTokenPrice());
    uint256 tokenId = nft.mint{ value: nft.nativePrice() }(7);
    vm.stopPrank();

    assertEq(tokenId, 1);
    assertEq(nft.ownerOf(tokenId), player);
    assertEq(nft.referrerOf(tokenId), 7);
    assertEq(aipro.balanceOf(player), 0);
    assertEq(aipro.balanceOf(address(this)), 1_000_000_000 ether + 100_000 ether);
    assertEq(address(this).balance, ownerEth + 0.01 ether);
    assertEq(address(nft).balance, 0);
  }

  function testMintRevertsWithoutHandleOrWrongFee() public {
    vm.prank(player);
    vm.expectRevert(LocalAiproNft.NoBinanceHandle.selector);
    nft.mint{ value: 0.01 ether }(0);

    handles.setHandle(player, "tester");
    vm.startPrank(player);
    aipro.approve(address(nft), 100_000 ether);
    vm.expectRevert(LocalAiproNft.WrongNativeFee.selector);
    nft.mint{ value: 0.02 ether }(0);
    vm.stopPrank();
  }
}
