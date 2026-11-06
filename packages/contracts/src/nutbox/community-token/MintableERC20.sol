// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";

contract MintableERC20 is ERC20Burnable, AccessControlEnumerable {
  bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

  constructor(
    string memory name,
    string memory symbol,
    uint256 initialSupply,
    address owner,
    address communityFactory
  ) ERC20(name, symbol) {
    _grantRole(DEFAULT_ADMIN_ROLE, communityFactory);
    _mint(owner, initialSupply);
  }

  function mint(address to, uint256 amount) external virtual {
    require(hasRole(MINTER_ROLE, msg.sender), "ERC20PresetMinterPauser: must have minter role to mint");
    _mint(to, amount);
  }

  function supportsInterface(bytes4 interfaceId) public view override(AccessControlEnumerable) returns (bool) {
    return super.supportsInterface(interfaceId);
  }
}
