// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.24;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { ERC721Enumerable } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice 本地链上的 AIPRO NFT。配置里的主网 NFT 没有代码时，由 PostDeploy 部署。
/// @dev tokenId 从 1 起。保管合约用 0 表示这只钱包还没有质押。
contract LocalAiproNft is ERC721Enumerable, Ownable {
  uint256 public nextTokenId = 1;

  constructor() ERC721("AIPRO", "AIPRO") Ownable(msg.sender) {}

  /// @dev 只有部署者能铸造。玩家钱包不能自己给自己发 NFT。
  function mint(address to) external onlyOwner returns (uint256 tokenId) {
    tokenId = nextTokenId++;
    _safeMint(to, tokenId);
  }
}
