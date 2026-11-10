// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import { IBinanceHandle } from "./IBinanceHandle.sol";
import { IGamePassNFT } from "./IGamePassNFT.sol";

/// @notice 保管 AIPRO NFT。质押后才能进入当前轮，本轮结束才能取出。
contract AiproNftStake is Ownable, IERC721Receiver, IGamePassNFT {
  error NoBinanceHandle();
  error SeasonNotOpen();
  error PlayerAlreadyStaked();
  error TokenAlreadyStaked();
  error StillInRound();
  error NotStaker();
  error UnknownNft();

  IERC721 public immutable nft;
  IBinanceHandle public immutable handleRegistry;

  address public activeWorld;
  uint8 public activeSeason;

  mapping(uint256 tokenId => address player) public stakerOf;
  mapping(uint256 tokenId => address world) public tokenBoundWorld;
  mapping(uint256 tokenId => uint8 season) public tokenBoundSeason;
  mapping(address world => mapping(uint8 season => mapping(address player => uint256 tokenId)))
    public seasonPlayerToken;

  event Staked(uint256 indexed tokenId, address indexed world, uint8 indexed season, address player);
  event Withdrawn(uint256 indexed tokenId, address indexed world, uint8 indexed season, address player);
  event ActiveSeasonSet(address indexed world, uint8 indexed season);
  event ActiveSeasonCleared();

  constructor(address nft_, address handleRegistry_) Ownable(msg.sender) {
    require(nft_ != address(0), "nft required");
    require(handleRegistry_ != address(0), "handle registry required");
    nft = IERC721(nft_);
    handleRegistry = IBinanceHandle(handleRegistry_);
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

  /// @dev 一只钱包一轮只收一枚。NFT 转到本合约，玩家在本轮内不能转走。
  function stake(uint256 tokenId) public {
    if (bytes(handleRegistry.handleOf(msg.sender)).length == 0) revert NoBinanceHandle();
    if (!isSeasonOpen()) revert SeasonNotOpen();
    if (seasonPlayerToken[activeWorld][activeSeason][msg.sender] != 0) revert PlayerAlreadyStaked();
    if (stakerOf[tokenId] != address(0)) revert TokenAlreadyStaked();

    nft.safeTransferFrom(msg.sender, address(this), tokenId);

    stakerOf[tokenId] = msg.sender;
    tokenBoundWorld[tokenId] = activeWorld;
    tokenBoundSeason[tokenId] = activeSeason;
    seasonPlayerToken[activeWorld][activeSeason][msg.sender] = tokenId;

    emit Staked(tokenId, activeWorld, activeSeason, msg.sender);
  }

  /// @dev 当前轮还开着，并且这枚 NFT 就是这一轮的质押时，不能取出。
  function withdraw(uint256 tokenId) public {
    address player = stakerOf[tokenId];
    if (player != msg.sender) revert NotStaker();
    if (isTokenInGame(tokenId)) revert StillInRound();

    address boundWorld = tokenBoundWorld[tokenId];
    uint8 boundSeason = tokenBoundSeason[tokenId];
    if (seasonPlayerToken[boundWorld][boundSeason][player] == tokenId) {
      delete seasonPlayerToken[boundWorld][boundSeason][player];
    }
    delete stakerOf[tokenId];
    delete tokenBoundWorld[tokenId];
    delete tokenBoundSeason[tokenId];

    nft.safeTransferFrom(address(this), player, tokenId);
    emit Withdrawn(tokenId, boundWorld, boundSeason, player);
  }

  function stakedTokenOf(address player) public view returns (uint256) {
    if (!isSeasonOpen()) return 0;
    return seasonPlayerToken[activeWorld][activeSeason][player];
  }

  function isSeasonOpen() public view returns (bool) {
    return activeWorld != address(0) && activeSeason != 0;
  }

  function isTokenInGame(uint256 tokenId) public view returns (bool) {
    if (!isSeasonOpen()) return false;
    return tokenBoundWorld[tokenId] == activeWorld && tokenBoundSeason[tokenId] == activeSeason;
  }

  function isPlayerInActiveSeason(address player) public view returns (bool) {
    return stakedTokenOf(player) != 0;
  }

  function onERC721Received(address, address, uint256, bytes calldata) external view returns (bytes4) {
    if (msg.sender != address(nft)) revert UnknownNft();
    return IERC721Receiver.onERC721Received.selector;
  }
}
