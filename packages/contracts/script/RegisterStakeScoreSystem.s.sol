// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import { Script } from "forge-std/Script.sol";
import { console } from "forge-std/console.sol";
import { StoreSwitch } from "@latticexyz/store/src/StoreSwitch.sol";
import { Systems } from "@latticexyz/world/src/codegen/tables/Systems.sol";
import { ResourceId } from "@latticexyz/store/src/ResourceId.sol";

import { IWorld } from "../src/codegen/world/IWorld.sol";
import { DFUtils, PLANET_WITHDRAW_SILVER_SYSTEM_NAME, WITHDRAW_MATERIAL_SYSTEM_NAME } from "../src/lib/DFUtils.sol";
import { DFXStarStakingLib } from "../src/lib/DFXStarStakingLib.sol";
import { StakeScoreSystem } from "../src/systems/StakeScoreSystem.sol";
import { PlanetWithdrawSilverSystem } from "../src/systems/PlanetWithdrawSilverSystem.sol";
import { WithdrawMaterialSystem } from "../src/systems/WithdrawMaterialSystem.sol";

/// @notice 给已经部署的 World 补上记分根系统，并换成会走这条入口的两个提取系统。不重跑 PostDeploy。
contract RegisterStakeScoreSystem is Script {
  function run(address worldAddress) external {
    StoreSwitch.setStoreAddress(worldAddress);
    ResourceId silverId = DFUtils.getSystemResourceId(PLANET_WITHDRAW_SILVER_SYSTEM_NAME);
    ResourceId materialId = DFUtils.getSystemResourceId(WITHDRAW_MATERIAL_SYSTEM_NAME);
    bool silverPublic = Systems.getPublicAccess(silverId);
    bool materialPublic = Systems.getPublicAccess(materialId);

    uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
    vm.startBroadcast(deployerPrivateKey);
    IWorld world = IWorld(worldAddress);
    // 先挂上根系统，再替换提取系统。替换后的提取系统会立刻调用它。
    world.registerSystem(DFXStarStakingLib.stakeScoreSystemId(), new StakeScoreSystem(), true);
    world.registerSystem(silverId, new PlanetWithdrawSilverSystem(), silverPublic);
    world.registerSystem(materialId, new WithdrawMaterialSystem(), materialPublic);
    vm.stopBroadcast();

    console.log("Stake score system:", Systems.getSystem(DFXStarStakingLib.stakeScoreSystemId()));
    console.log("Withdraw silver system:", Systems.getSystem(silverId));
    console.log("Withdraw material system:", Systems.getSystem(materialId));
  }
}
