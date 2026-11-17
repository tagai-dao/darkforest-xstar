// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.24;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { ERC721Enumerable } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IBinanceHandle } from "./IBinanceHandle.sol";

/// @notice 本地链上的 AIPRO NFT。玩家自己付费铸造，调用形状和 BSC 上的 `mint(uint256)` 一致。
/// @dev tokenId 从 1 起。保管合约用 0 表示这只钱包还没有质押。
contract LocalAiproNft is ERC721Enumerable, Ownable {
  using SafeERC20 for IERC20;

  error NoBinanceHandle();
  error WrongNativeFee();
  error NativeFeeTransferFailed();

  /// @dev 100000 枚 AIPRO。链上数量带 18 位小数。
  uint256 public constant communityTokenPrice = 100_000 ether;

  /// @dev 0.01 个原生币。附带的 value 必须正好是这个数。
  uint256 public constant nativePrice = 0.01 ether;

  uint256 public nextTokenId = 1;

  IERC20 public immutable paymentToken;
  IBinanceHandle public immutable handleRegistry;

  /// @dev 推荐人的 NFT 编号。本地没有推荐分成，只把调用时传入的编号留下。
  mapping(uint256 tokenId => uint256 referrerTokenId) public referrerOf;

  constructor(address paymentToken_, address handleRegistry_) ERC721("AIPRO", "AIPRO") Ownable(msg.sender) {
    require(paymentToken_ != address(0), "payment token required");
    require(handleRegistry_ != address(0), "handle registry required");
    paymentToken = IERC20(paymentToken_);
    handleRegistry = IBinanceHandle(handleRegistry_);
  }

  /// @param referrerTokenId 推荐人的 NFT 编号。没有推荐人时传 0。
  /// @return tokenId 铸给调用者的编号。
  function mint(uint256 referrerTokenId) external payable returns (uint256 tokenId) {
    if (bytes(handleRegistry.handleOf(msg.sender)).length == 0) revert NoBinanceHandle();
    if (msg.value != nativePrice) revert WrongNativeFee();

    // AIPRO 和原生币都交给部署者。NFT 合约自己不留余额。
    paymentToken.safeTransferFrom(msg.sender, owner(), communityTokenPrice);
    (bool paid, ) = owner().call{ value: msg.value }("");
    if (!paid) revert NativeFeeTransferFailed();

    tokenId = nextTokenId++;
    referrerOf[tokenId] = referrerTokenId;
    _safeMint(msg.sender, tokenId);
  }
}
