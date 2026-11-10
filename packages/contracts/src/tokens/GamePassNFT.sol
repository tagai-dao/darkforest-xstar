// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { ERC721Enumerable } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import { IGamePassNFT } from "./IGamePassNFT.sol";

/// @notice 旧的自铸通行证。新局不再部署它，入场改为 AiproNftStake 保管 AIPRO NFT。
contract GamePassNFT is Ownable, ERC721Enumerable, IGamePassNFT {
  using SafeERC20 for IERC20;

  error NotTokenOwner();
  error SeasonNotOpen();
  error PlayerAlreadyJoined();
  error PassInActiveSeason();
  error PassNotBound();
  error BoundPassNotTransferable();

  IERC20 public immutable paymentToken;
  uint256 public immutable price;

  address public activeWorld;
  uint8 public activeSeason;

  uint256 public nextTokenId = 1;

  mapping(uint256 tokenId => address world) public tokenBoundWorld;
  mapping(uint256 tokenId => uint8 season) public tokenBoundSeason;
  mapping(address world => mapping(uint8 season => mapping(address player => uint256 tokenId)))
    public seasonPlayerToken;

  event PassPurchased(address indexed player, uint256 indexed tokenId, uint256 price);
  event PassMinted(address indexed to, uint256 indexed tokenId);
  event ActiveSeasonSet(address indexed world, uint8 indexed season);
  event ActiveSeasonCleared();
  event PassJoined(uint256 indexed tokenId, address indexed world, uint8 indexed season, address player);
  event PassUnbound(uint256 indexed tokenId, address indexed world, uint8 indexed season, address player);

  constructor(address paymentToken_, uint256 price_) Ownable(msg.sender) ERC721("DarkForestPunk Pass", "DFPASS") {
    paymentToken = IERC20(paymentToken_);
    price = price_;
  }

  function setActiveSeason(address world, uint8 season) public onlyOwner {
    require(world != address(0), "world required");
    require(season != 0, "season required");
    activeWorld = world;
    activeSeason = season;
    emit ActiveSeasonSet(world, season);
  }

  function clearActiveSeason() public onlyOwner {
    activeWorld = address(0);
    activeSeason = 0;
    emit ActiveSeasonCleared();
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

  function joinSeason(uint256 tokenId) public {
    if (ownerOf(tokenId) != msg.sender) {
      revert NotTokenOwner();
    }
    if (!isSeasonOpen()) {
      revert SeasonNotOpen();
    }
    if (isTokenInGame(tokenId)) {
      return;
    }

    address player = msg.sender;
    if (seasonPlayerToken[activeWorld][activeSeason][player] != 0) {
      revert PlayerAlreadyJoined();
    }

    address previousWorld = tokenBoundWorld[tokenId];
    uint8 previousSeason = tokenBoundSeason[tokenId];
    if (previousWorld != address(0) || previousSeason != 0) {
      if (seasonPlayerToken[previousWorld][previousSeason][player] == tokenId) {
        delete seasonPlayerToken[previousWorld][previousSeason][player];
      }
    }

    tokenBoundWorld[tokenId] = activeWorld;
    tokenBoundSeason[tokenId] = activeSeason;
    seasonPlayerToken[activeWorld][activeSeason][player] = tokenId;

    emit PassJoined(tokenId, activeWorld, activeSeason, player);
  }

  function unbind(uint256 tokenId) public {
    if (ownerOf(tokenId) != msg.sender) {
      revert NotTokenOwner();
    }
    if (isTokenInGame(tokenId)) {
      revert PassInActiveSeason();
    }

    address boundWorld = tokenBoundWorld[tokenId];
    uint8 boundSeason = tokenBoundSeason[tokenId];
    if (boundWorld == address(0) && boundSeason == 0) {
      revert PassNotBound();
    }

    address player = msg.sender;
    if (seasonPlayerToken[boundWorld][boundSeason][player] == tokenId) {
      delete seasonPlayerToken[boundWorld][boundSeason][player];
    }

    delete tokenBoundWorld[tokenId];
    delete tokenBoundSeason[tokenId];

    emit PassUnbound(tokenId, boundWorld, boundSeason, player);
  }

  function isSeasonOpen() public view returns (bool) {
    return activeWorld != address(0) && activeSeason != 0;
  }

  function isTokenInGame(uint256 tokenId) public view returns (bool) {
    if (!isSeasonOpen()) {
      return false;
    }
    return tokenBoundWorld[tokenId] == activeWorld && tokenBoundSeason[tokenId] == activeSeason;
  }

  function isPlayerInActiveSeason(address player) public view returns (bool) {
    if (!isSeasonOpen()) {
      return false;
    }
    return seasonPlayerToken[activeWorld][activeSeason][player] != 0;
  }

  function _mintPass(address to) internal returns (uint256 tokenId) {
    tokenId = nextTokenId++;
    _safeMint(to, tokenId);
    emit PassMinted(to, tokenId);
  }

  function _update(address to, uint256 tokenId, address auth) internal override(ERC721Enumerable) returns (address) {
    address from = _ownerOf(tokenId);
    if (from != address(0) && to != address(0) && isTokenInGame(tokenId)) {
      revert BoundPassNotTransferable();
    }

    return super._update(to, tokenId, auth);
  }
}
