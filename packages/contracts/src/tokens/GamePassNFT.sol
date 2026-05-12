// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { ERC721Enumerable } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import { IStoreRead } from "@latticexyz/store/src/IStoreRead.sol";
import { FieldLayout } from "@latticexyz/store/src/FieldLayout.sol";
import { ResourceId } from "@latticexyz/store/src/ResourceId.sol";
import { IGamePassNFT } from "./IGamePassNFT.sol";

contract GamePassNFT is Ownable, ERC721Enumerable, IGamePassNFT {
  using SafeERC20 for IERC20;

  // Mirrors the generated Round table constants, so the standalone NFT can read the active season from the World.
  ResourceId constant ROUND_TABLE_ID = ResourceId.wrap(0x74626466000000000000000000000000526f756e640000000000000000000000);
  FieldLayout constant ROUND_FIELD_LAYOUT =
    FieldLayout.wrap(0x0001010001000000000000000000000000000000000000000000000000000000);

  error NotTokenOwner();
  error PassAlreadyBound();
  error PlayerAlreadyBound();
  error PassNotBound();
  error SeasonStillActive();
  error BoundPassNotTransferable();

  IERC20 public immutable paymentToken;
  address public immutable world;
  uint256 public immutable price;

  uint256 public nextTokenId = 1;

  mapping(uint256 tokenId => uint8 round) public tokenBoundRound;
  mapping(uint256 tokenId => address player) public tokenBoundPlayer;
  mapping(uint8 round => mapping(address player => uint256 tokenId)) public seasonPlayerToken;

  event PassPurchased(address indexed player, uint256 indexed tokenId, uint256 price);
  event PassMinted(address indexed to, uint256 indexed tokenId);
  event PassBound(uint256 indexed tokenId, uint8 indexed round, address indexed player);
  event PassUnbound(uint256 indexed tokenId, uint8 indexed round, address indexed player);

  constructor(address paymentToken_, address world_, uint256 price_) Ownable(msg.sender) ERC721("DarkForestPunk Pass", "DFPASS") {
    paymentToken = IERC20(paymentToken_);
    world = world_;
    price = price_;
  }

  function ownerMint(address to) public onlyOwner returns (uint256 tokenId) {
    tokenId = _mintPass(to);
  }

  function ownerMintBatch(address[] calldata recipients) public onlyOwner {
    for (uint256 i; i < recipients.length; i++) {
      _mintPass(recipients[i]);
    }
  }

  function buyPass() public returns (uint256 tokenId) {
    paymentToken.safeTransferFrom(msg.sender, address(this), price);
    tokenId = _mintPass(msg.sender);
    emit PassPurchased(msg.sender, tokenId, price);
  }

  function bindToCurrentRound(uint256 tokenId) public {
    if (ownerOf(tokenId) != msg.sender) {
      revert NotTokenOwner();
    }
    if (tokenBoundPlayer[tokenId] != address(0)) {
      revert PassAlreadyBound();
    }

    uint8 round = currentRound();
    if (seasonPlayerToken[round][msg.sender] != 0) {
      revert PlayerAlreadyBound();
    }

    tokenBoundRound[tokenId] = round;
    tokenBoundPlayer[tokenId] = msg.sender;
    seasonPlayerToken[round][msg.sender] = tokenId;

    emit PassBound(tokenId, round, msg.sender);
  }

  function unbindAfterSeason(uint256 tokenId) public {
    address player = tokenBoundPlayer[tokenId];
    if (player == address(0)) {
      revert PassNotBound();
    }
    if (ownerOf(tokenId) != msg.sender && player != msg.sender) {
      revert NotTokenOwner();
    }

    uint8 boundRound = tokenBoundRound[tokenId];
    if (currentRound() <= boundRound) {
      revert SeasonStillActive();
    }

    delete tokenBoundRound[tokenId];
    delete tokenBoundPlayer[tokenId];
    delete seasonPlayerToken[boundRound][player];

    emit PassUnbound(tokenId, boundRound, player);
  }

  function isBoundToCurrentRound(address player) public view returns (bool) {
    return seasonPlayerToken[currentRound()][player] != 0;
  }

  function currentRound() public view returns (uint8 round) {
    bytes32[] memory keyTuple = new bytes32[](0);
    bytes32 blob = IStoreRead(world).getStaticField(ROUND_TABLE_ID, keyTuple, 0, ROUND_FIELD_LAYOUT);
    return uint8(bytes1(blob));
  }

  function _mintPass(address to) internal returns (uint256 tokenId) {
    tokenId = nextTokenId++;
    _safeMint(to, tokenId);
    emit PassMinted(to, tokenId);
  }

  function _update(address to, uint256 tokenId, address auth) internal override(ERC721Enumerable) returns (address) {
    address from = _ownerOf(tokenId);
    if (from != address(0) && to != address(0) && tokenBoundPlayer[tokenId] != address(0)) {
      revert BoundPassNotTransferable();
    }

    return super._update(to, tokenId, auth);
  }
}
