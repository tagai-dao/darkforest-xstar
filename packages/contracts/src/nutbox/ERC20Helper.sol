// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "nutbox/interfaces/IMintable.sol";

contract ERC20Helper {
  function lockERC20(address tokenAddress, address owner, address recipient, uint256 amount) internal {
    IERC20 erc20 = IERC20(tokenAddress);
    _safeTransferFrom(erc20, owner, recipient, amount);
  }

  function releaseERC20(address tokenAddress, address recipient, uint256 amount) internal {
    IERC20 erc20 = IERC20(tokenAddress);
    _safeTransfer(erc20, recipient, amount);
  }

  function mintERC20(address tokenAddress, address recipient, uint256 amount) internal {
    IMintable(tokenAddress).mint(recipient, amount);
  }

  function burnERC20(address tokenAddress, address owner, uint256 amount) internal {
    ERC20Burnable erc20 = ERC20Burnable(tokenAddress);
    erc20.burnFrom(owner, amount);
  }

  function _safeTransfer(IERC20 token, address to, uint256 value) private {
    _safeCall(token, abi.encodeWithSelector(token.transfer.selector, to, value));
  }

  function _safeTransferFrom(IERC20 token, address from, address to, uint256 value) private {
    _safeCall(token, abi.encodeWithSelector(token.transferFrom.selector, from, to, value));
  }

  function _safeCall(IERC20 token, bytes memory data) private {
    (bool success, bytes memory returndata) = address(token).call(data);
    require(success, "ERC20: call failed");
    if (returndata.length > 0) {
      require(abi.decode(returndata, (bool)), "ERC20: operation did not succeed");
    }
  }
}
