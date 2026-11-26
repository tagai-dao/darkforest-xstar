// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import { Script } from "forge-std/Script.sol";
import { console } from "forge-std/console.sol";
import { StoreSwitch } from "@latticexyz/store/src/StoreSwitch.sol";
import { stdToml } from "forge-std/StdToml.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";
import { ResourceId, WorldResourceIdLib } from "@latticexyz/world/src/WorldResourceId.sol";
import { Systems } from "@latticexyz/world/src/codegen/tables/Systems.sol";
import { BuySilverSystem } from "../src/systems/BuySilverSystem.sol";
import { StakeScoreSystem } from "../src/systems/StakeScoreSystem.sol";
import { DFXStarStakingLib } from "../src/lib/DFXStarStakingLib.sol";

import { IWorld } from "../src/codegen/world/IWorld.sol";
import { SpaceType, PlanetType, ArtifactRarity, PlanetStatus } from "../src/codegen/common.sol";
import { PlanetMetadata, PlanetMetadataData, Planet, PlanetData, PlanetOwner, PlanetConstants } from "../src/codegen/index.sol";
import { PlanetInitialResource, PlanetInitialResourceData } from "../src/codegen/index.sol";
import { UniverseConfig, UniverseConfigData, TempConfigSet, TempConfigSetData } from "../src/codegen/index.sol";
import { SpaceTypeConfig, SpaceTypeConfigData } from "../src/codegen/index.sol";
import { UniverseZoneConfig, UniverseZoneConfigData } from "../src/codegen/index.sol";
import { PlanetLevelConfig, PlanetTypeConfig } from "../src/codegen/index.sol";
import { SnarkConfig, SnarkConfigData, Ticker } from "../src/codegen/index.sol";
import { InnerCircle, InnerCircleData } from "../src/codegen/index.sol";
import { UpgradeConfig, UpgradeConfigData } from "../src/codegen/index.sol";
import { GuildConfig, GuildConfigData } from "../src/codegen/index.sol";
import { Round } from "../src/codegen/index.sol";
import { ArtifactNFT as ArtifactNFTTable } from "../src/codegen/index.sol";
import { GamePassNFT as GamePassNFTTable } from "../src/codegen/index.sol";
import { AtfInstallModule } from "../src/codegen/index.sol";
import { RevealedPlanet, PlanetBiomeConfig, PlanetBiomeConfigData, ArtifactConfig } from "../src/codegen/index.sol";
import { JunkConfig, JunkConfigData } from "../src/codegen/index.sol";
import { DFXStarConfig } from "../src/codegen/index.sol";
import { DFXStarConfigLib } from "../src/lib/DFXStarConfigLib.sol";
import { SilverPurchaseConfig } from "../src/codegen/index.sol";
import { SilverMarket } from "../src/lib/SilverMarket.sol";
import { ArtifactInstallModule } from "../src/modules/atfs/ArtifactInstallModule.sol";
import { installCannon } from "../src/modules/atfs/PhotoidCannon/CannonInstallLibrary.sol";
import { installWormhole } from "../src/modules/atfs/Wormhole/WormholeInstallLibrary.sol";
import { installBloomFilter } from "../src/modules/atfs/BloomFilter/BloomFilterInstallLibrary.sol";
import { installPinkBomb } from "../src/modules/atfs/PinkBomb/PinkBombInstallLibrary.sol";
import { IArtifactNFT } from "../src/tokens/IArtifactNFT.sol";
import { ArtifactNFT } from "../src/tokens/ArtifactNFT.sol";
import { AiproNftStake } from "../src/tokens/AiproNftStake.sol";
import { LocalAiproNft } from "../src/tokens/LocalAiproNft.sol";
import { LocalHandleRegistry } from "../src/tokens/LocalHandleRegistry.sol";
import { EntryFee } from "codegen/tables/EntryFee.sol";
import { Committee } from "nutbox/Committee.sol";
import { CommunityFactory } from "nutbox/CommunityFactory.sol";
import { HourlyTickCalculator } from "nutbox/calculators/HourlyTickCalculator.sol";
import { DFXStarScoreStakingFactory } from "nutbox/dapps/dfxstar-score-staking/DFXStarScoreStakingFactory.sol";
import { MintableERC20Factory } from "nutbox/community-token/MintableERC20Factory.sol";
import { MintableERC20 } from "nutbox/community-token/MintableERC20.sol";
import { Community } from "nutbox/Community.sol";

contract PostDeploy is Script {
  using stdToml for string;
  using Strings for uint256;

  function run(address worldAddress) external {
    // Specify a store so that you can use tables directly in PostDeploy
    StoreSwitch.setStoreAddress(worldAddress);

    // Load the private key from the `PRIVATE_KEY` environment variable (in .env)
    uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

    // Start broadcasting transactions from the deployer account
    vm.startBroadcast(deployerPrivateKey);

    // Set planet metadata
    _setPlanetMetadata(worldAddress);

    // configure the universe
    string memory tomlPath = "df.config.toml";
    string memory toml = vm.readFile(tomlPath);
    UniverseConfig.set(abi.decode(toml.parseRaw(".universe"), (UniverseConfigData)));
    TempConfigSet.set(abi.decode(toml.parseRaw(".temp"), (TempConfigSetData)));
    SpaceTypeConfig.set(abi.decode(toml.parseRaw(".space_type"), (SpaceTypeConfigData)));
    UniverseZoneConfig.set(abi.decode(toml.parseRaw(".universe_zone"), (UniverseZoneConfigData)));
    PlanetLevelConfig.set(abi.decode(toml.parseRaw(".planet_level.thresholds"), (uint32[])));
    PlanetBiomeConfig.set(abi.decode(toml.parseRaw(".planet_biome"), (PlanetBiomeConfigData)));
    for (uint256 i = 1; i <= uint8(type(SpaceType).max); i++) {
      for (uint256 j; j <= PlanetLevelConfig.length(); j++) {
        string memory key = string.concat(".planet_type.thresholds.", i.toString(), ".", j.toString());
        PlanetTypeConfig.set(SpaceType(uint8(i)), uint8(j), abi.decode(toml.parseRaw(key), (uint16[])));
      }
    }
    SnarkConfig.set(abi.decode(toml.parseRaw(".snark"), (SnarkConfigData)));
    Ticker.set(0, uint64(toml.readUint(".ticker.rate")), 0, true);
    InnerCircle.set(abi.decode(toml.parseRaw(".inner_circle"), (InnerCircleData)));
    UpgradeConfig.set(abi.decode(toml.parseRaw(".upgrade_config"), (UpgradeConfigData)));
    GuildConfig.set(abi.decode(toml.parseRaw(".guild_config"), (GuildConfigData)));
    uint8[] memory indexes = abi.decode(toml.parseRaw(".artifact.indexes"), (uint8[]));
    for (uint256 i = 1; i <= uint8(type(ArtifactRarity).max); i++) {
      string memory key = string.concat(".artifact.", i.toString());
      ArtifactConfig.set(ArtifactRarity(i), indexes, abi.decode(toml.parseRaw(key), (uint16[])));
    }
    JunkConfig.set(abi.decode(toml.parseRaw(".junk_config"), (JunkConfigData)));
    uint8 roundNum = abi.decode(toml.parseRaw(".round.number"), (uint8));
    Round.set(roundNum);
    address artifactNftAddress = abi.decode(toml.parseRaw(".artifact_nft.address"), (address));
    if (artifactNftAddress == address(0)) {
      artifactNftAddress = address(new ArtifactNFT());
      _setArtifactNFTConfig(artifactNftAddress);
    }
    ArtifactNFTTable.set(artifactNftAddress);
    if (toml.readBool(".artifact_nft.set_current_round")) {
      IArtifactNFT(artifactNftAddress).setDF(roundNum, worldAddress);
    }
    _setSilverPurchaseConfig(toml);
    _registerBuySilverSystem(worldAddress);
    // 付费铸造要扣本地 AIPRO，所以先建社区代币，再部署 NFT。
    _setDFXStarConfig(toml, worldAddress);
    _setGamePassConfig(toml);

    // set entry fee
    uint256 entryFee = toml.readUint(".entry_fee.value");
    if (entryFee > 0) EntryFee.set(entryFee);

    // deploy artifact install module
    ArtifactInstallModule artifactInstallModule = new ArtifactInstallModule();
    AtfInstallModule.set(address(artifactInstallModule));

    // install artifacts
    _installArtifacts(worldAddress);

    // set test planets
    if (toml.readBool(".test.set_planets")) {
      if (toml.readBool(".temp.b_skip_proof_check")) {
        _setTestPlanets(abi.decode(toml.parseRaw(".test_planets_fake"), (TestPlanet[])));
      } else {
        _setTestPlanets(abi.decode(toml.parseRaw(".test_planets"), (TestPlanet[])));
      }
    }

    // 记分根系统跑在 World 里，积分池只需要认 World 这一个管理员。
    IWorld(worldAddress).registerSystem(DFXStarStakingLib.stakeScoreSystemId(), new StakeScoreSystem(), true);

    // register fallback delegation of df namespace
    IWorld(worldAddress).registerNamespaceDelegation(
      WorldResourceIdLib.encodeNamespace("df"),
      WorldResourceIdLib.encode("sy", "df", "DfDelegationCtrl"),
      new bytes(0)
    );

    vm.stopBroadcast();
  }

  function _setPlanetMetadata(address worldAddress) internal {
    console.log("Setting planet metadata");
    IWorld(worldAddress).df__setPlanetMetadata(
      0,
      PlanetMetadataData(99, 160, 400, 100000, 417, 0, 0), // range, speed, defense, populationCap, populationGrowth, silverCap, silverGrowth
      0 // initialPopulationPercentage
    );

    IWorld(worldAddress).df__setPlanetMetadata(1, PlanetMetadataData(177, 160, 400, 400000, 833, 100000, 56), 1);
    IWorld(worldAddress).df__setPlanetMetadata(2, PlanetMetadataData(315, 160, 300, 1600000, 1250, 500000, 167), 2);
    IWorld(worldAddress).df__setPlanetMetadata(3, PlanetMetadataData(591, 160, 300, 6000000, 1667, 2500000, 417), 3);
    IWorld(worldAddress).df__setPlanetMetadata(4, PlanetMetadataData(1025, 160, 300, 25000000, 2083, 12000000, 833), 4);
    IWorld(worldAddress).df__setPlanetMetadata(
      5,
      PlanetMetadataData(1734, 160, 200, 100000000, 2500, 50000000, 1667),
      5
    );
    IWorld(worldAddress).df__setPlanetMetadata(
      6,
      PlanetMetadataData(2838, 160, 200, 300000000, 2917, 100000000, 2778),
      7
    );
    IWorld(worldAddress).df__setPlanetMetadata(
      7,
      PlanetMetadataData(4414, 160, 200, 500000000, 3333, 200000000, 2778),
      10
    );
    IWorld(worldAddress).df__setPlanetMetadata(
      8,
      PlanetMetadataData(6306, 160, 200, 700000000, 3750, 300000000, 2778),
      20
    );
    IWorld(worldAddress).df__setPlanetMetadata(
      9,
      PlanetMetadataData(8829, 160, 200, 800000000, 4167, 400000000, 2778),
      25
    );
  }

  struct TestPlanet {
    int32 x;
    int32 y;
    bytes32 planetHash;
    address owner;
    uint64 lastUpdateTick;
    uint8 perlin;
    uint8 level;
    PlanetType planetType;
    SpaceType spaceType;
    uint64 population;
    uint64 silver;
    uint24 upgrades;
  }

  function _setTestPlanets(TestPlanet[] memory planets) internal {
    console.log("Dropping test planets");
    for (uint256 i; i < planets.length; i++) {
      PlanetConstants.set(
        planets[i].planetHash,
        planets[i].perlin,
        planets[i].level,
        planets[i].planetType,
        planets[i].spaceType
      );
      Planet.set(
        planets[i].planetHash,
        planets[i].lastUpdateTick,
        planets[i].population,
        planets[i].silver,
        planets[i].upgrades,
        false
      );
      PlanetOwner.set(planets[i].planetHash, planets[i].owner);
      if (planets[i].owner != address(0)) {
        SilverMarket.noteCapture(planets[i].level);
      }
      RevealedPlanet.set(planets[i].planetHash, planets[i].x, planets[i].y, planets[i].owner);
    }
  }

  function _installArtifacts(address worldAddress) internal {
    console.log("Installing artifacts");
    uint256 index = installCannon(worldAddress);
    console.log("Installed cannon with index", index);
    index = installWormhole(worldAddress);
    console.log("Installed wormhole with index", index);
    index = installBloomFilter(worldAddress);
    console.log("Installed bloom filter with index", index);
    index = installPinkBomb(worldAddress);
    console.log("Installed pinkbomb with index", index);
  }

  function _registerBuySilverSystem(address worldAddress) internal {
    IWorld world = IWorld(worldAddress);
    ResourceId systemId = WorldResourceIdLib.encode("sy", "df", "BuySilverSystem");
    world.registerSystem(systemId, new BuySilverSystem(worldAddress), true);
    world.registerFunctionSelector(systemId, "buySilver(uint256,uint8)");
    world.registerFunctionSelector(systemId, "quoteBuySilver(uint256,uint8)");
    world.registerFunctionSelector(systemId, "trustedWorld()");
  }

  function _setDFXStarConfig(string memory toml, address worldAddress) internal {
    address scoreStakingPool = toml.readAddress(".dfxstar.score_staking_pool");
    address paymentToken = toml.readAddress(".dfxstar.payment_token");
    address stakingFactory = toml.readAddress(".dfxstar.staking_factory");
    address community = toml.readAddress(".dfxstar.community");
    // df 命名空间的系统是普通 call，扣款的是系统合约，不是 World。
    address buySilverSystem = Systems.getSystem(WorldResourceIdLib.encode("sy", "df", "BuySilverSystem"));

    // 配置里写的是主网地址。这条链上没有代码时，部署本地的 AIPRO 社区，不能把空地址写进表。
    // 分叉上这些合约已经有代码，就沿用，不另建社区。
    bool configuredLive = paymentToken.code.length > 0 && community.code.length > 0 && stakingFactory.code.length > 0;
    if (!configuredLive) {
      console.log("DFXStar: configured AIPRO stack has no code, bootstrapping local Nutbox...");
      uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
      address deployer = vm.addr(deployerPrivateKey);
      NutboxAddresses memory addrs = _bootstrapNutbox(deployer, worldAddress);
      scoreStakingPool = addrs.pool;
      paymentToken = addrs.paymentToken;
      stakingFactory = addrs.dfxFactory;
      community = addrs.community;
      Committee(payable(addrs.committee)).adminAddFeeFreeAddress(worldAddress);
      console.log("DFXStar: local Nutbox bootstrap complete");
    } else if (scoreStakingPool.code.length == 0) {
      console.log("DFXStar: existing community set, pool is created later by AddAIPRODFXStarPool");
    }

    if (scoreStakingPool != address(0) || paymentToken != address(0)) {
      // 5000 是默认销毁一半。管理员之后用 updateSilverBurnBps 改。
      DFXStarConfigLib.set(scoreStakingPool, paymentToken, stakingFactory, community, buySilverSystem, 5000);
      console.log("DFXStar: config set");
      console.log("  BuySilverSystem:", buySilverSystem);
    }
  }

  struct NutboxAddresses {
    address committee;
    address communityFactory;
    address calculator;
    address dfxFactory;
    address community;
    address paymentToken;
    address pool;
  }

  function _bootstrapNutbox(address owner, address worldAddress) internal returns (NutboxAddresses memory addrs) {
    // 1. Deploy Committee (all fees = 0 for local testing)
    Committee committee = new Committee(payable(owner));
    committee.adminSetCreateCommunityFee(0);
    committee.adminSetCommunitySettingsFee(0);
    committee.adminSetPoolOperationFee(0);
    addrs.committee = address(committee);
    console.log("  Committee:", addrs.committee);

    // 2. Deploy MintableERC20Factory
    MintableERC20Factory mintableFactory = new MintableERC20Factory();
    committee.adminAddContract(address(mintableFactory));
    console.log("  MintableERC20Factory:", address(mintableFactory));

    // 3. Deploy CommunityFactory
    CommunityFactory communityFactory = new CommunityFactory(address(committee));
    addrs.communityFactory = address(communityFactory);
    console.log("  CommunityFactory:", addrs.communityFactory);

    // 4. 与 AIPRO 社区相同：HourlyTickCalculator，空的 distribution policy。
    HourlyTickCalculator calculator = new HourlyTickCalculator(address(communityFactory));
    committee.adminAddContract(address(calculator));
    addrs.calculator = address(calculator);
    console.log("  HourlyTickCalculator:", addrs.calculator);

    // 5. Deploy DFXStarScoreStakingFactory
    DFXStarScoreStakingFactory dfxFactory = new DFXStarScoreStakingFactory(address(communityFactory));
    committee.adminAddContract(address(dfxFactory));
    addrs.dfxFactory = address(dfxFactory);
    console.log("  DFXStarScoreStakingFactory:", addrs.dfxFactory);

    // 6. 本地代币用 AIPRO 这个名字，总量 10 亿，全部铸给部署者。主网那枚代币在这条链上没有代码。
    bytes memory tokenMeta = _encodeTokenMeta("AIPRO", "AIPRO", 1_000_000_000 ether, owner);

    address communityAddr = communityFactory.createCommunity(
      true, // isMintable
      address(0), // communityToken = 0 → auto-create via factory
      address(mintableFactory),
      tokenMeta,
      address(calculator),
      bytes("")
    );
    addrs.community = communityAddr;
    console.log("  AIPRO Community:", addrs.community);

    // 7. 社区代币就是买银和注入用的 AIPRO。
    addrs.paymentToken = Community(payable(communityAddr)).getCommunityToken();
    console.log("  AIPRO Token:", addrs.paymentToken);

    // 8. 主网 DFX 池的比例是 0，每小时释放分给另外三个池。这里没有那三个池的工厂。
    // 比例总和必须是 10000 或 0，所以这个唯一的池拿满 10000。计算器的 policy 仍是空的，不会自动释放。
    uint16[] memory ratios = new uint16[](1);
    ratios[0] = 10000;
    // meta 里的 World 会写进池子，之后不能改。记分只认这个地址。
    Community(payable(communityAddr)).adminAddPool(
      "DFXStar Score Staking",
      ratios,
      address(dfxFactory),
      abi.encode(worldAddress)
    );

    // 9. Get pool address
    addrs.pool = Community(payable(communityAddr)).activedPools(0);
    console.log("  DFXStar Pool:", addrs.pool);
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
    // owner address (20 bytes, left-padded to 32 in the contract but we write last 20)
    for (uint256 i = 0; i < 20; i++) {
      meta[offset++] = bytes1(uint8(uint160(owner) >> (8 * (19 - i))));
    }
    return meta;
  }

  /// @dev 旧的三档全局表。购银已改读 SilverMarket，这里只是继续把配置写入，避免旧部署脚本缺字段。
  function _setSilverPurchaseConfig(string memory toml) internal {
    uint256[3] memory tierPrices;
    uint256[3] memory tierSilverAmounts;
    tierPrices[0] = toml.readUint(".silver_purchase.tier_0_price") * 1 ether;
    tierPrices[1] = toml.readUint(".silver_purchase.tier_1_price") * 1 ether;
    tierPrices[2] = toml.readUint(".silver_purchase.tier_2_price") * 1 ether;
    tierSilverAmounts[0] = toml.readUint(".silver_purchase.tier_0_silver") * 1000;
    tierSilverAmounts[1] = toml.readUint(".silver_purchase.tier_1_silver") * 1000;
    tierSilverAmounts[2] = toml.readUint(".silver_purchase.tier_2_silver") * 1000;
    SilverPurchaseConfig.setTierPrices(tierPrices);
    SilverPurchaseConfig.setTierSilverAmounts(tierSilverAmounts);
  }

  function _setGamePassConfig(string memory toml) internal {
    address nftAddress = toml.readAddress(".game_pass.nft_address");
    address handleRegistry = toml.readAddress(".game_pass.handle_registry");

    // 本地 anvil 上没有主网合约。登记处要先于 NFT，因为铸造时要读 handle。
    if (handleRegistry == address(0) || handleRegistry.code.length == 0) {
      handleRegistry = address(new LocalHandleRegistry());
      console.log("Local handle registry:", handleRegistry);
    }
    if (nftAddress == address(0) || nftAddress.code.length == 0) {
      address paymentToken = DFXStarConfig.getPaymentToken();
      require(paymentToken.code.length > 0, "AIPRO token required");
      nftAddress = address(new LocalAiproNft(paymentToken, handleRegistry));
      console.log("Local AIPRO NFT:", nftAddress);
    }

    AiproNftStake locker = new AiproNftStake(nftAddress, handleRegistry);
    GamePassNFTTable.set(address(locker));
    console.log("Game pass locker:", address(locker));
  }

  function _setArtifactNFTConfig(address artifactNftAddress) internal {
    require(artifactNftAddress != address(0), "artifactNftAddress is not set");
    ArtifactNFT nft = ArtifactNFT(artifactNftAddress);
    uint8[] memory artifactTypeIndexes = new uint8[](5);
    string[] memory artifactTypeNames = new string[](5);

    artifactTypeIndexes[3] = 1;
    artifactTypeNames[3] = "Pink Bomb";

    artifactTypeIndexes[1] = 5;
    artifactTypeNames[1] = "Wormhole";

    artifactTypeIndexes[2] = 4;
    artifactTypeNames[2] = "Bloom Filter";

    artifactTypeIndexes[0] = 6;
    artifactTypeNames[0] = "Photoid Cannon";

    nft.bulkSetArtifactTypeNames(artifactTypeIndexes, artifactTypeNames);

    uint8[] memory artifactRarityIndexes = new uint8[](5);
    string[] memory artifactRarityNames = new string[](5);

    artifactRarityIndexes[0] = 1;
    artifactRarityNames[0] = "COMMON";

    artifactRarityIndexes[1] = 2;
    artifactRarityNames[1] = "RARE";

    artifactRarityIndexes[2] = 3;
    artifactRarityNames[2] = "EPIC";

    artifactRarityIndexes[3] = 4;
    artifactRarityNames[3] = "LEGENDARY";

    artifactRarityIndexes[4] = 5;
    artifactRarityNames[4] = "MYTHIC";

    nft.bulkSetArtifactRarityNames(artifactRarityIndexes, artifactRarityNames);

    uint8[] memory biomeIndexes = new uint8[](10);
    string[] memory biomeNames = new string[](10);

    biomeIndexes[0] = 1;
    biomeNames[0] = "OCEAN";

    biomeIndexes[1] = 2;
    biomeNames[1] = "FOREST";

    biomeIndexes[2] = 3;
    biomeNames[2] = "GRASSLAND";

    biomeIndexes[3] = 4;
    biomeNames[3] = "TUNDRA";

    biomeIndexes[4] = 5;
    biomeNames[4] = "SWAMP";

    biomeIndexes[5] = 6;
    biomeNames[5] = "DESERT";

    biomeIndexes[6] = 7;
    biomeNames[6] = "ICE";

    biomeIndexes[7] = 8;
    biomeNames[7] = "WASTELAND";

    biomeIndexes[8] = 9;
    biomeNames[8] = "LAVA";

    biomeIndexes[9] = 10;
    biomeNames[9] = "CORRUPTED";

    nft.bulkSetBiomeNames(biomeIndexes, biomeNames);
  }
}
