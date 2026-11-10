// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import { Script } from "forge-std/Script.sol";
import { console } from "forge-std/console.sol";
import { StoreSwitch } from "@latticexyz/store/src/StoreSwitch.sol";

import { DFXStarConfig } from "../src/codegen/index.sol";
import { ITestOnlySystem } from "../src/codegen/world/ITestOnlySystem.sol";
import { Committee } from "nutbox/Committee.sol";
import { CommunityFactory } from "nutbox/CommunityFactory.sol";
import { Community } from "nutbox/Community.sol";
import { HourlyTickCalculator } from "nutbox/calculators/HourlyTickCalculator.sol";
import { MintableERC20Factory } from "nutbox/community-token/MintableERC20Factory.sol";
import { DFXStarScoreStakingFactory } from "nutbox/dapps/dfxstar-score-staking/DFXStarScoreStakingFactory.sol";

/// @notice 给已经部署的本地 World 补上 Nutbox 质押池。不重跑 PostDeploy。
/// df.config.toml 里的 AIPRO 主网地址在空 anvil 上没有代码，收取分数会在 depositFromGame 失败。
contract AttachLocalNutbox is Script {
  struct Deployed {
    address committee;
    address community;
    address paymentToken;
    address stakingFactory;
    address pool;
  }

  function run(address worldAddress) external {
    StoreSwitch.setStoreAddress(worldAddress);
    address currentPool = DFXStarConfig.getScoreStakingPool();
    if (currentPool.code.length > 0) {
      console.log("Pool already has code:", currentPool);
      return;
    }

    uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
    vm.startBroadcast(deployerPrivateKey);
    Deployed memory deployed = _deploy(vm.addr(deployerPrivateKey), worldAddress);
    // 买银授权对象记成 World。系统是 delegatecall，address(this) 就是 World。
    ITestOnlySystem(worldAddress).df__setDFXStarConfig(
      deployed.pool,
      deployed.paymentToken,
      deployed.stakingFactory,
      deployed.community,
      worldAddress
    );
    vm.stopBroadcast();

    console.log("Committee:", deployed.committee);
    console.log("Community:", deployed.community);
    console.log("Payment token:", deployed.paymentToken);
    console.log("Staking factory:", deployed.stakingFactory);
    console.log("Pool:", deployed.pool);
  }

  function _deploy(address deployer, address worldAddress) internal returns (Deployed memory deployed) {
    deployed.committee = _newCommittee(deployer);
    address mintableFactory = _newMintableFactory(deployed.committee);
    address communityFactory = address(new CommunityFactory(deployed.committee));
    address calculator = address(new HourlyTickCalculator(communityFactory));
    Committee(payable(deployed.committee)).adminAddContract(calculator);

    deployed.stakingFactory = address(new DFXStarScoreStakingFactory(communityFactory));
    Committee(payable(deployed.committee)).adminAddContract(deployed.stakingFactory);

    deployed.community = _createCommunity(communityFactory, mintableFactory, calculator, deployer);
    deployed.paymentToken = Community(payable(deployed.community)).getCommunityToken();
    deployed.pool = _addPool(deployed.community, deployed.stakingFactory, worldAddress);

    // 记分由根系统在 World 里发出，积分池看到的调用方是 World。建池时已经把这个地址写进池子。
    Committee(payable(deployed.committee)).adminAddFeeFreeAddress(worldAddress);
  }

  /// 费用为 0，避免收取分数时还要附带手续费。
  function _newCommittee(address deployer) internal returns (address) {
    Committee committee = new Committee(payable(deployer));
    committee.adminSetCreateCommunityFee(0);
    committee.adminSetCommunitySettingsFee(0);
    committee.adminSetPoolOperationFee(0);
    return address(committee);
  }

  function _newMintableFactory(address committee) internal returns (address mintableFactory) {
    mintableFactory = address(new MintableERC20Factory());
    Committee(payable(committee)).adminAddContract(mintableFactory);
  }

  /// 本地代币用 AIPRO 这个名字。主网那枚代币在这条链上没有代码。
  function _createCommunity(
    address communityFactory,
    address mintableFactory,
    address calculator,
    address deployer
  ) internal returns (address) {
    return
      CommunityFactory(communityFactory).createCommunity(
        true,
        address(0),
        mintableFactory,
        _encodeTokenMeta("AIPRO", "AIPRO", 1_000_000_000 ether, deployer),
        calculator,
        bytes("")
      );
  }

  function _addPool(address community, address stakingFactory, address worldAddress) internal returns (address) {
    uint16[] memory ratios = new uint16[](1);
    ratios[0] = 10000;
    Community(payable(community)).adminAddPool(
      "DFXStar Score Staking",
      ratios,
      stakingFactory,
      abi.encode(worldAddress)
    );
    return Community(payable(community)).activedPools(0);
  }

  function _encodeTokenMeta(
    string memory name,
    string memory symbol,
    uint256 supply,
    address owner
  ) internal pure returns (bytes memory) {
    bytes memory nameBytes = bytes(name);
    bytes memory symbolBytes = bytes(symbol);
    bytes memory meta = new bytes(1 + nameBytes.length + 1 + symbolBytes.length + 32 + 20);
    uint256 offset = 0;
    meta[offset++] = bytes1(uint8(nameBytes.length));
    for (uint256 i = 0; i < nameBytes.length; i++) {
      meta[offset++] = nameBytes[i];
    }
    meta[offset++] = bytes1(uint8(symbolBytes.length));
    for (uint256 i = 0; i < symbolBytes.length; i++) {
      meta[offset++] = symbolBytes[i];
    }
    bytes32 supplyBytes = bytes32(supply);
    for (uint256 i = 0; i < 32; i++) {
      meta[offset++] = supplyBytes[i];
    }
    for (uint256 i = 0; i < 20; i++) {
      meta[offset++] = bytes1(uint8(uint160(owner) >> (8 * (19 - i))));
    }
    return meta;
  }
}
