// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import "nutbox/community-token/MintableERC20.sol";
import "nutbox/interfaces/ICommunityTokenFactory.sol";

contract MintableERC20Factory is ICommunityTokenFactory {
  function createCommunityToken(bytes calldata meta) external override returns (address) {
    uint8 nameLength;
    assembly ("memory-safe") {
      nameLength := shr(248, calldataload(meta.offset))
    }
    bytes memory nameBytes = new bytes(nameLength);
    for (uint i = 0; i < nameLength; i++) {
      nameBytes[i] = meta[1 + i];
    }
    string memory name = string(nameBytes);

    uint256 symbolOffset = 1 + nameLength;
    uint8 symbolLength;
    assembly ("memory-safe") {
      symbolLength := shr(248, calldataload(add(meta.offset, symbolOffset)))
    }
    bytes memory symbolBytes = new bytes(symbolLength);
    for (uint i = 0; i < symbolLength; i++) {
      symbolBytes[i] = meta[symbolOffset + 1 + i];
    }
    string memory symbol = string(symbolBytes);

    uint256 supplyOffset = symbolOffset + 1 + symbolLength;
    require(meta.length >= supplyOffset + 52, "Meta layout error");

    uint256 supply;
    address owner;
    assembly ("memory-safe") {
      supply := calldataload(add(meta.offset, supplyOffset))
      owner := shr(96, calldataload(add(meta.offset, add(supplyOffset, 32))))
    }

    MintableERC20 token = new MintableERC20(name, symbol, supply, owner, msg.sender);
    return address(token);
  }
}
