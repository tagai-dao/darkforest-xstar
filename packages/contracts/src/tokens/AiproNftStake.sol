// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.24;

import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import { IBinanceHandle } from "./IBinanceHandle.sol";
import { IGamePassNFT } from "./IGamePassNFT.sol";

/// @notice 保管 AIPRO NFT。质押着才能操作游戏，可以随时取出。
contract AiproNftStake is IERC721Receiver, IGamePassNFT {
  error NoBinanceHandle();
  error PlayerAlreadyStaked();
  error TokenAlreadyStaked();
  error NotStaker();
  error UnknownNft();

  IERC721 public immutable nft;
  IBinanceHandle public immutable handleRegistry;

  mapping(uint256 tokenId => address player) public stakerOf;
  mapping(address player => uint256 tokenId) public stakedTokenOf;

  event Staked(uint256 indexed tokenId, address indexed player);
  event Withdrawn(uint256 indexed tokenId, address indexed player);

  constructor(address nft_, address handleRegistry_) {
    require(nft_ != address(0), "nft required");
    require(handleRegistry_ != address(0), "handle registry required");
    nft = IERC721(nft_);
    handleRegistry = IBinanceHandle(handleRegistry_);
  }

  /// @dev 一只钱包同时只收一枚。NFT 转到本合约，玩家随时可以取回。
  function stake(uint256 tokenId) public {
    if (bytes(handleRegistry.handleOf(msg.sender)).length == 0) revert NoBinanceHandle();
    // tokenId 可以是 0，所以用质押关系判断，不用「编号是否为 0」。
    if (stakerOf[stakedTokenOf[msg.sender]] == msg.sender) revert PlayerAlreadyStaked();
    if (stakerOf[tokenId] != address(0)) revert TokenAlreadyStaked();

    nft.safeTransferFrom(msg.sender, address(this), tokenId);

    stakerOf[tokenId] = msg.sender;
    stakedTokenOf[msg.sender] = tokenId;

    emit Staked(tokenId, msg.sender);
  }

  function withdraw(uint256 tokenId) public {
    address player = stakerOf[tokenId];
    if (player != msg.sender) revert NotStaker();

    delete stakerOf[tokenId];
    delete stakedTokenOf[player];

    nft.safeTransferFrom(address(this), player, tokenId);
    emit Withdrawn(tokenId, player);
  }

  /// @dev 名字沿用已部署的保管合约。现在只表示 NFT 还在这里，不再看季号和世界。
  function isPlayerInActiveSeason(address player) public view returns (bool) {
    return stakerOf[stakedTokenOf[player]] == player;
  }

  function onERC721Received(address, address, uint256, bytes calldata) external view returns (bytes4) {
    if (msg.sender != address(nft)) revert UnknownNft();
    return IERC721Receiver.onERC721Received.selector;
  }
}
