// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import { Script } from "forge-std/Script.sol";
import { console } from "forge-std/console.sol";
import { stdToml } from "forge-std/StdToml.sol";
import { Community } from "nutbox/Community.sol";

/// @notice 在已经存在的 AIPRO Nutbox 社区上新建 DFXStar 池。
/// @dev 不在 PostDeploy 里执行。社区 owner 确认比例后单独广播。
contract AddAIPRODFXStarPool is Script {
  using stdToml for string;

  function run() external {
    string memory toml = vm.readFile("df.aipro.toml");
    require(toml.readBool(".aipro.ready"), "df.aipro.toml ready=false");

    address token = toml.readAddress(".aipro.token");
    address community = toml.readAddress(".aipro.community");
    address factory = toml.readAddress(".aipro.factory");
    address world = toml.readAddress(".aipro.world");
    require(world != address(0), "world required");
    uint256[] memory rawRatios = toml.readUintArray(".aipro.ratios");

    require(Community(payable(community)).getCommunityToken() == token, "community token mismatch");

    uint256 activeCount = _activePoolCount(community);
    require(rawRatios.length == activeCount + 1, "ratios length must be active pools + 1");

    uint16[] memory ratios = new uint16[](rawRatios.length);
    uint256 sum;
    for (uint256 i = 0; i < rawRatios.length; i++) {
      require(rawRatios[i] <= 10000, "ratio exceeds 10000");
      ratios[i] = uint16(rawRatios[i]);
      sum += rawRatios[i];
    }
    require(sum == 10000, "ratio sum must be 10000");

    uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
    vm.startBroadcast(deployerPrivateKey);
    // 调用者必须是 AIPRO Community owner。工厂必须已在 Committee 白名单中。
    // 这个 World 写进池子后不能改。只有它能向这个池记分。
    Community(payable(community)).adminAddPool("DFXStar Score Staking", ratios, factory, abi.encode(world));
    vm.stopBroadcast();

    address pool = Community(payable(community)).activedPools(activeCount);
    console.log("DFXStar pool:", pool);
  }

  function _activePoolCount(address community) internal view returns (uint256 count) {
    while (true) {
      try Community(payable(community)).activedPools(count) returns (address pool) {
        if (pool == address(0)) return count;
        count++;
      } catch {
        return count;
      }
    }
  }
}
