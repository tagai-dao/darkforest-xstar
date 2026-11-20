import { BLOCKCHAIN_NAME } from "@df/constants";
import { MaterialType, PlanetType, TooltipName } from "@df/types";
import React from "react";

import { getPlanetRank, isFullRank } from "../../Backend/Utils/Utils";
import { ScoreLabel, SilverLabel } from "../Components/Labels/KeywordLabels";
import {
  Blue,
  Colored,
  Green,
  Pink,
  Red,
  Text,
  White,
} from "../Components/Text";
import { useAccount, useSelectedPlanet, useUIManager } from "../Utils/AppHooks";
import { getMaterialColor, getMaterialIcon } from "./PlanetMaterialsPane";

export function NetworkHealthPane() {
  return (
    <>
      <White>${BLOCKCHAIN_NAME} Tx Speed: </White>For each auto gas setting
      (which you can choose in the <White>Settings</White> Pane), the average
      amount of time it takes a transaction with that setting to confirm. The
      Dark Forest client uploads diagnostic info (you can turn this off via
      settings), which is aggregated into this network health indicator. I hope
      you find it helpful in cases the network is being slow.
    </>
  );
}

export function WithdrawSilverButton() {
  return (
    <>
      This is a <Text>Spacetime Rip</Text> where you can withdraw{" "}
      <SilverLabel /> for <ScoreLabel />!
    </>
  );
}
export function DefenseMultiplierPane() {
  return <>Defense multiplier</>;
}

export function EnergyCapMultiplierPane() {
  return <>EnergyCap multiplier</>;
}

export function EnergyGrowthMultiplierPane() {
  return <>EnergyGrowth multiplier</>;
}

export function RangeMultiplierPane() {
  return <>Range multiplier</>;
}

export function SpeedMultiplierPane() {
  return <>Speed multiplier</>;
}

export function DepositArtifactPane() {
  return <>Deposit this artifact</>;
}

export function DeactivateArtifactPane() {
  return <>Deactivate this artifact</>;
}

export function WithdrawArtifactPane() {
  return <>Withdraw this artifact</>;
}

export function ChargeArtifactPane() {
  return <>Charge this artifact</>;
}

export function ActivateArtifactPane() {
  return <>Activate this artifact</>;
}

export function ShutdownArtifactPane() {
  return <>Shutdown this artifact</>;
}

// 神器列表里的图标按钮说明（中文）
export function ArtifactCopyChargePane() {
  return (
    <>
      <White>复制充能单：</White>粘贴给 agent
      即可充能。粉红炸弹充能时会揭示所选目标的坐标。
    </>
  );
}

export function ArtifactCopyActivatePane() {
  return (
    <>
      <White>复制激活单：</White>粘贴给 agent
      即可激活。激活后按这件神器的效果生效，之后可能进入冷却或损坏。
    </>
  );
}

export function ArtifactCopyShutdownPane() {
  return (
    <>
      <White>复制关闭单：</White>粘贴给 agent 即可关闭这件神器。
    </>
  );
}

export function ArtifactCopyLandPane() {
  return (
    <>
      <White>复制摧毁单：</White>要在到达之后的 <White>300 tick</White>{" "}
      内粘贴，才能摧毁目标周围的星球。
    </>
  );
}

// 神器名称后面“？”的说明。内容来自游戏文档里对四种神器的规则，时间单位都是 tick。
export function ArtifactHelpPinkBombPane() {
  return (
    <>
      <White>粉红炸弹</White>
      <br />
      <White>作用：</White>远程摧毁目标周围一定半径内的星球，用完即毁。
      <br />
      <White>用法：</White>
      <br />
      1. 选好目标，复制充能单，充能 14400 tick，会揭示目标坐标。
      <br />
      2. 充能完成后复制激活单，发射并冷却 14400
      tick；射程和速度暂时减半，发射耗能 = 能量上限 / 20 × 2^(距离/射程)。
      <br />
      3. 到达后的 300 tick 内复制摧毁单粘贴，摧毁目标周围的星球。
      <br />
      摧毁半径：普通 500 / 稀有 1000 / 史诗 1500 / 传说 2000 / 神话
      2500。只能用在 4 级及以上的星球，稀有度越高上限越高。
    </>
  );
}

export function ArtifactHelpBloomFilterPane() {
  return (
    <>
      <White>布隆过滤器</White>
      <br />
      <White>作用：</White>
      把这颗星球的能量直接补满到能量上限，然后神器损坏（一次性）。
      <br />
      <White>用法：</White>不用充能，也不冷却，直接复制激活单粘贴给 agent。
      <br />
      稀有度决定能用在哪些等级的星球：普通 0 到 2 级 / 稀有 3 到 4 级 / 史诗 5
      到 6 级 / 传说 7 到 8 级 / 神话 9 级。等级不符时按钮会置灰。
    </>
  );
}

export function ArtifactHelpWormholePane() {
  return (
    <>
      <White>虫洞</White>
      <br />
      <White>作用：</White>
      把你自己的两颗星球连起来，缩短它们之间的航行距离，可以反复开关。
      <br />
      <White>用法：</White>
      <br />
      1.
      在放着虫洞的星球上选另一颗自己的星球，复制激活单（两端必须是同一个拥有者，不能连自己）。
      <br />
      2. 激活后冷却 14400 tick。不用时复制关闭单即可关掉。
      <br />
      距离 = 原距离 × 系数 / 1000：普通 500 / 稀有 250 / 史诗 125 / 传说 62 /
      神话 31。同一条连线上已有虫洞时，系数会相乘。
    </>
  );
}

export function ArtifactHelpCannonPane() {
  return (
    <>
      <White>火炮</White>
      <br />
      <White>作用：</White>让这颗星球的下一次移动射程变成 2
      倍，速度按稀有度放大（普通 500% / 稀有 1000% / 史诗 1500% / 传说 2000% /
      神话 2500%），用完即毁。没有等级限制。
      <br />
      <White>用法：</White>
      <br />
      1. 复制充能单，充能 14400 tick。充能期间这颗星球的防御会按稀有度缩小。
      <br />
      2. 充能完成后复制激活单。
      <br />
      3. 激活后发出下一次移动，加成随这次移动结算，防御削弱也一起去掉。
      <br />
      一颗星球同时只能有一门火炮在充能或待发。
    </>
  );
}

export function ArtifactCarryPane() {
  return (
    <>
      <White>出发时携带：</White>
      勾选后，按住这颗星球拖到目标星球出发，出发命令里会带上这件神器，和运银是同一次拖动。再点一次取消勾选；每次出发后会自动取消。
    </>
  );
}

export function TimeUntilActivationPossiblePane() {
  return (
    <>You must wait this amount of time before you can activate this artifact</>
  );
}

export function TwitterHandleTooltipPane() {
  return (
    <>
      You may connect your account to <White>Twitter</White>
      <br />
      to identify yourself on the <White>Leaderboard</White>.
    </>
  );
}

export function RankTooltipPane() {
  return (
    <>
      Your current rank, based on <ScoreLabel />.
    </>
  );
}

export function ScoreTooltipPane() {
  return (
    <>
      You need to <White> withdraw silver or marterials</White> to get the{" "}
      <ScoreLabel />. Check out the <White>Help Pane</White> for more info on
      scoring.
    </>
  );

  // return (
  //   <>
  //     Your score is dependent on how close you can get to the center (0,0) of
  //     the universe. You need to <White> claim your planet (3+ level) </White> to
  //     get the <ScoreLabel />. Check out the <White>Help Pane</White> for more
  //     info on scoring.
  //   </>
  // );
}

export function PlayerSilverTooltipPane() {
  return (
    <>
      You earn <SilverLabel /> by withdrawing silver. Check out the{" "}
      <White>Help Pane</White> for more info on player&apos;s silver.
    </>
  );
}

export function MiningPauseTooltipPane() {
  return (
    <>
      开始或停下探索。每次看一片 <White>16</White> × <White>16</White>{" "}
      的坐标，把里面的星球找出来。
    </>
  );
}

export function MiningTargetTooltipPane() {
  return <>点地图上的任意位置。探索会从那一片继续向外找星球。</>;
}

export function CurrentMiningTooltipPane() {
  return <>当前正在探索的坐标。</>;
}

export function BonusTooltipPane() {
  return (
    <>
      <Green>This stat has been randomly doubled!</Green>
    </>
  );
}

export function SilverTooltipPane() {
  return (
    <>
      <White>银：</White>宇宙中的货币，用来买升级。目前只有
      <White>小行星带（Asteroid Field）</White>会产银。
    </>
  );
}

export function EnergyTooltipPane() {
  return (
    <>
      <White>能量：</White>用来发起移动。能量沿 <White>S 形曲线</White>增长，在
      <White>上限的 50%</White> 时增长最快。
    </>
  );
}

export function PlanetRankTooltipPane() {
  const uiManager = useUIManager();
  const selected = useSelectedPlanet(uiManager);
  const rank = getPlanetRank(selected.value);
  return (
    <>
      This planet is{" "}
      <White>
        {isFullRank(selected.value) ? "fully upgraded" : "rank " + rank}
      </White>
      !
    </>
  );
}

export function MaxLevelTooltipPane() {
  return (
    <>
      This planet is <White>Level 9</White>, making it one of the <br />
      most powerful planets in the galaxy!
    </>
  );
}

export function SilverProdTooltipPane() {
  return (
    <>
      This planet produces <White>Silver</White>! Use it to buy upgrades!
    </>
  );
}

export function SelectedSilverTooltipPane() {
  const uiManager = useUIManager();
  const selected = useSelectedPlanet(uiManager);

  return (
    <>
      {selected.value ? (
        <>
          <>
            Silver:
            <span>{selected.value.silver}</span>
          </>
          <>
            Cap:
            <span>{selected.value.silverCap}</span>
          </>
          {selected.value.planetType === PlanetType.SILVER_MINE ? (
            <>
              Growth:
              {/* 每 tick 的银成长（客户端值已是页面单位） */}
              <span>{selected.value.silverGrowth}</span>
            </>
          ) : (
            <>
              <Red>This planet does not produce silver.</Red>
            </>
          )}
        </>
      ) : (
        <>Select a planet to view more about its stats. </>
      )}
    </>
  );
}

export function RangeTooltipPane() {
  return (
    <>
      <White>射程：</White>能派出兵力的距离。<White>兵力会随距离衰减</White>
      ，射程越高，同样距离上的衰减越少。
    </>
  );
}

export function MinEnergyTooltipPane() {
  return (
    <>
      The minimum energy you need to send a move from this planet. <br />
      Moves incur a base cost of 5% of the planet&apos;s{" "}
      <White>Energy Cap</White>.
    </>
  );
}

export function Time50TooltipPane() {
  return (
    <>
      Time to <White>50%</White> of full energy.
    </>
  );
}

export function Time90TooltipPane() {
  return (
    <>
      Time to <White>90%</White> of full energy. Since energy grows on an
      s-curve, energy growth slows drastically by this point.
    </>
  );
}

export function EnergyGrowthTooltipPane() {
  return (
    <>
      <White>能量成长：</White>能量正好是上限一半时，每个 tick 增加的最大速度
      （即 <White>S 形曲线</White>的中点）。
    </>
  );
}

export function SilverGrowthTooltipPane() {
  return (
    <>
      <White>银成长：</White>这颗星球的银每分钟线性增加的量，直到银上限。
    </>
  );
}

export function SilverCapTooltipPane() {
  return (
    <>
      <White>Silver Cap</White>: the maximum silver that this planet can hold.
    </>
  );
}

export function PiratesTooltipPane() {
  return (
    <>
      <Red>This planet has space pirates!</Red> Move energy to unoccupied
      planets to conquer them!
    </>
  );
}

export function UpgradesTooltipPane() {
  return (
    <>
      <White>Planet Rank</White>: the number of times you&apos;ve upgraded your
      planet.
    </>
  );
}

export function ModalHelpTooltipPane() {
  return <>View patch notes and instructions</>;
}

export function ModalPlanetDetailsTooltipPane() {
  return <>View detailed information about the selected planet</>;
}

export function ModalLeaderboardTooltipPane() {
  return <>View the top players, and their top planets</>;
}

export function ModalPlanetDexTooltipPane() {
  return <>View a list of your planets</>;
}

export function ModalUpgradeDetailsTooltipPane() {
  return <>Upgrade the selected planet</>;
}

export function ModalTwitterVerificationTooltipPane() {
  return <>Connect your address to Twitter</>;
}

export function ModalBroadcastTooltipPane() {
  return <>Broadcast the selected planet&apos;s coordinates to the world</>;
}

export function BonusEnergyCapTooltipPane() {
  return (
    <>
      <Green>
        This planet&apos;s <White>Energy Cap</White> has been randomly doubled!
      </Green>
    </>
  );
}

export function BonusEnergyGroTooltipPane() {
  return (
    <>
      <Green>
        This planet&apos;s <White>Energy Growth</White> has been randomly
        doubled!
      </Green>
    </>
  );
}

export function BonusRangeTooltipPane() {
  return (
    <>
      <Green>
        This planet&apos;s <White>Range</White> has been randomly doubled!
      </Green>
    </>
  );
}

export function BonusSpeedTooltipPane() {
  return (
    <>
      <Green>
        This planet&apos;s <White>Speed</White> has been randomly doubled!
      </Green>
    </>
  );
}

export function BonusDefenseTooltipPane() {
  return (
    <>
      <Green>
        This planet&apos;s <White>Defense</White> has been randomly doubled!
      </Green>
    </>
  );
}

export function BonusSpaceJunkTooltipPane() {
  return (
    <>
      <Green>
        This planet&apos;s <White>Space Junk</White> has been randomly halved!
      </Green>
    </>
  );
}

export function ClowntownTooltipPane() {
  const uiManager = useUIManager();
  const selected = useSelectedPlanet(uiManager);
  const account = useAccount(uiManager);

  return (
    <>
      <span>
        {selected.value?.owner === account
          ? `You are the proud mayor of Clown Town!`
          : `It's a town of clowns...`}
      </span>
    </>
  );
}

function DefenseTooltipPane() {
  return (
    <>
      <White>防御：</White>防御越高，越能抵消入侵的伤害。防御低于{" "}
      <White>100</White> 的星球很脆弱，会受到更多伤害。
    </>
  );
}

function SpaceJunkTooltipPane() {
  return (
    // <>
    //   <White>Space Junk:</White> Planets are all filled with junk! Sending
    //   energy to a planet with junk will remove the junk from that planet and add
    //   it to your total junk. Once you reach your junk limit, you will not be
    //   able to capture planets that have junk. Abandoning planets will reduce
    //   your space junk and place it back on the planet.
    // </>
    <>
      <White>太空垃圾：</White>
      玩家操作星球前，必须先把这颗星球的垃圾登记到自己的
      垃圾配额里。清除垃圾后，你会自动放弃这颗星球的所有权；即使别人占领了它，你仍然可以清除垃圾。
    </>
  );
}

function AbandonTooltipPane() {
  const uiManager = useUIManager();
  const abandonSpeedBoost = uiManager.getAbandonSpeedChangePercent() / 100;
  const abandonRangeBoost = uiManager.getAbandonRangeChangePercent() / 100;

  return (
    <>
      <Red>Abandon your planet:</Red> Give up ownership of this planet to dump
      some of your space junk here. This triggers a special movement that sends
      full <White>Energy/Silver</White> and gives a{" "}
      <Green>Range boost of {abandonRangeBoost}x</Green> and a{" "}
      <Green>Speed boost of {abandonSpeedBoost}x</Green>.
      <br />
      <Red>
        You cannot abandon your home planet, or a planet that has incoming
        voyages.
      </Red>
    </>
  );
}

function SpeedTooltipPane() {
  return (
    <>
      <White>速度：</White>能量在宇宙中传播的速度，<White>越快越好</White>。
    </>
  );
}

function RetryTransactionPane() {
  return <>Retry transaction.</>;
}

function CancelTransactionPane() {
  return <>Cancel transaction.</>;
}

function PrioritizeTransactionPane() {
  return <>Prioritize transaction.</>;
}

function ArtifactBuffPane() {
  return <>A powerful artifact on this planet is influencing this stat!</>;
}

function PluginsTooltipPane() {
  return (
    <>Manage plugins, which allow you to add functionality to the client.</>
  );
}

function SettingsPane() {
  return <>Manage settings - export SKEY, manage maps, and more.</>;
}

function YourArtifacts() {
  return <>View your artifacts.</>;
}

function InvadablePane() {
  return <>This planet is in a scoring zone and can be invaded</>;
}

function CapturablePane() {
  return (
    <>This planet has been invaded, which means you can capture it for score.</>
  );
}

const ModalWithdrawSilverTooltipPane = () => (
  <>Withdraw silver to earn score.</>
);

const Hats = () => <>Buy skins for the selected planet.</>;

const FindArtifact = () => (
  <>
    <Green>This planet has a powerful artifact hidden somewhere!</Green> Maybe
    you could find it...
  </>
);

const ArtifactStored = () => <>This planet has a powerful artifact on it!</>;

const HashesPerSec = () => <>hashes / sec</>;

const DropBombDisabled = () => (
  <>
    You must <Pink>activate Bomb artifact</Pink> on this planet first.
  </>
);
const DropBomb = () => (
  <>
    <Pink>
      Dropping bomb will form a pink circle, you can destory every planet in
      pink circle.
    </Pink>
  </>
);
const PinkDisabled = () => (
  <>
    This planet should be in <Pink>your pink circle</Pink>.
  </>
);
const PinkButton = () => (
  <>
    <Pink> pink = destroy this planet</Pink>
  </>
);

const KardahsevDisabled = () => (
  <>
    You must <Blue>activate Kardashev artifact</Blue> on this planet first.
  </>
);
const Kardashev = () => (
  <>
    <Blue>
      Create blue circle that allows to teleport energy from other planets to
      the center planet
    </Blue>
  </>
);
const BlueDisabled = () => (
  <>
    This planet should be in <Blue>your pink circle</Blue>.
  </>
);
const BlueButton = () => (
  <>
    <Blue>
      transfer energy from this planet to the planet in the center of the blue
      circle.
    </Blue>
  </>
);
const BuyHat = () => (
  <>
    Buy skin for this planet,{" "}
    <Green>circular picture will be displayed on this planet.</Green>
  </>
);

// Material tooltip components
const MaterialWaterCrystalsTooltip = () => (
  <>
    {getMaterialIcon(MaterialType.WATER_CRYSTALS, 24)}
    <Colored color={getMaterialColor(MaterialType.WATER_CRYSTALS)}>
      水晶体：
    </Colored>{" "}
    采自深海井的闪亮液体，用于冷却系统、流体护盾和水反应引擎。
  </>
);

const MaterialLivingWoodTooltip = () => (
  <>
    {getMaterialIcon(MaterialType.LIVING_WOOD, 24)}
    <Colored color={getMaterialColor(MaterialType.LIVING_WOOD)}>
      活木：
    </Colored>{" "}
    柔韧的有机生物纤维，是再生船体装甲和光合科技模块的核心。
  </>
);

const MaterialWindsteelTooltip = () => (
  <>
    {getMaterialIcon(MaterialType.WINDSTEEL, 24)}
    <Colored color={getMaterialColor(MaterialType.WINDSTEEL)}>
      风钢：
    </Colored>{" "}
    用大气中的风钢矿脉纺成的轻质高导电合金，是涡轮推进器和贸易船骨架的关键材料。
  </>
);

const MaterialAuroriumTooltip = () => (
  <>
    {getMaterialIcon(MaterialType.AURORIUM, 24)}
    <Colored color={getMaterialColor(MaterialType.AURORIUM)}>
      极光金：
    </Colored>{" "}
    蕴含极地能量的发光矿物，采自极光照耀的冻原。用于高级导航核心、传感器阵列和能量反射船体装甲。
  </>
);

const MaterialMyceliumTooltip = () => (
  <>
    {getMaterialIcon(MaterialType.MYCELIUM, 24)}
    <Colored color={getMaterialColor(MaterialType.MYCELIUM)}>
      菌胶：
    </Colored>{" "}
    搏动的真菌凝胶，蕴含生命精华，为炼金反应堆和菌丝生长算法提供动力。
  </>
);

const MaterialSandglassTooltip = () => (
  <>
    {getMaterialIcon(MaterialType.SANDGLASS, 24)}
    <Colored color={getMaterialColor(MaterialType.SANDGLASS)}>
      沙玻璃：
    </Colored>{" "}
    能储存时间能量的尖锐颗粒状碎片，用于时间传感器和减速弹。
  </>
);

const MaterialCryostoneTooltip = () => (
  <>
    {getMaterialIcon(MaterialType.CRYOSTONE, 24)}
    <Colored color={getMaterialColor(MaterialType.CRYOSTONE)}>
      冰晶石：
    </Colored>{" "}
    在真空条件下锻造的冻结矿物，用于高级制冷、休眠舱和冷冻激光。
  </>
);

const MaterialScrapiumTooltip = () => (
  <>
    {getMaterialIcon(MaterialType.SCRAPIUM, 24)}
    <Colored color={getMaterialColor(MaterialType.SCRAPIUM)}>
      废金：
    </Colored>{" "}
    用废土废料熔铸的合金，重组为模块化部件，用于粗放的工业建造。
  </>
);

const MaterialPyrosteelTooltip = () => (
  <>
    {getMaterialIcon(MaterialType.PYROSTEEL, 24)}
    <Colored color={getMaterialColor(MaterialType.PYROSTEEL)}>
      火钢：
    </Colored>{" "}
    采自火山地带的超高密度合金，适合制造岩浆引擎、高温装甲和热能武器核心。
  </>
);

const MaterialBlackalloyTooltip = () => (
  <>
    {getMaterialIcon(MaterialType.BLACKALLOY, 24)}
    <Colored color={getMaterialColor(MaterialType.BLACKALLOY)}>
      黑合金：
    </Colored>{" "}
    在腐化区域合成的禁忌暗黑合金，致密而不稳定，在暗影科技中威力极大。
  </>
);

const MaterialCorruptedCrystalTooltip = () => (
  <>
    {getMaterialIcon(MaterialType.CORRUPTED_CRYSTAL, 24)}
    <Colored color={getMaterialColor(MaterialType.CORRUPTED_CRYSTAL)}>
      腐化水晶：
    </Colored>{" "}
    从现实扭曲的生态区提取的结晶腐化物，是 ZK
    反应堆、熵驱动和不稳定模块的关键材料。
  </>
);

export function TooltipContent({ name }: { name: TooltipName | undefined }) {
  if (name === TooltipName.SilverGrowth) {
    return <SilverGrowthTooltipPane />;
  }
  if (name === TooltipName.SilverCap) {
    return <SilverCapTooltipPane />;
  }
  if (name === TooltipName.Silver) {
    return <SilverTooltipPane />;
  }
  if (name === TooltipName.Energy) {
    return <EnergyTooltipPane />;
  }
  if (name === TooltipName.EnergyGrowth) {
    return <EnergyGrowthTooltipPane />;
  }
  if (name === TooltipName.Range) {
    return <RangeTooltipPane />;
  }
  if (name === TooltipName.TwitterHandle) {
    return <TwitterHandleTooltipPane />;
  }
  if (name === TooltipName.Bonus) {
    return <BonusTooltipPane />;
  }
  if (name === TooltipName.MinEnergy) {
    return <MinEnergyTooltipPane />;
  }
  if (name === TooltipName.Time50) {
    return <Time50TooltipPane />;
  }
  if (name === TooltipName.Time90) {
    return <Time90TooltipPane />;
  }
  if (name === TooltipName.Pirates) {
    return <PiratesTooltipPane />;
  }
  if (name === TooltipName.Upgrades) {
    return <UpgradesTooltipPane />;
  }
  if (name === TooltipName.PlanetRank) {
    return <PlanetRankTooltipPane />;
  }
  if (name === TooltipName.MaxLevel) {
    return <MaxLevelTooltipPane />;
  }
  if (name === TooltipName.SelectedSilver) {
    return <SelectedSilverTooltipPane />;
  }
  if (name === TooltipName.Rank) {
    return <RankTooltipPane />;
  }
  if (name === TooltipName.Score) {
    return <ScoreTooltipPane />;
  }
  if (name === TooltipName.PlayerSilver) {
    return <PlayerSilverTooltipPane />;
  }
  if (name === TooltipName.MiningPause) {
    return <MiningPauseTooltipPane />;
  }
  if (name === TooltipName.MiningTarget) {
    return <MiningTargetTooltipPane />;
  }
  if (name === TooltipName.CurrentMining) {
    return <CurrentMiningTooltipPane />;
  }
  if (name === TooltipName.SilverProd) {
    return <SilverProdTooltipPane />;
  }
  if (name === TooltipName.BonusEnergyCap) {
    return <BonusEnergyCapTooltipPane />;
  }
  if (name === TooltipName.BonusEnergyGro) {
    return <BonusEnergyGroTooltipPane />;
  }
  if (name === TooltipName.BonusRange) {
    return <BonusRangeTooltipPane />;
  }
  if (name === TooltipName.BonusSpeed) {
    return <BonusSpeedTooltipPane />;
  }
  if (name === TooltipName.BonusDefense) {
    return <BonusDefenseTooltipPane />;
  }
  if (name === TooltipName.BonusSpaceJunk) {
    return <BonusSpaceJunkTooltipPane />;
  }
  if (name === TooltipName.Clowntown) {
    return <ClowntownTooltipPane />;
  }
  if (name === TooltipName.ModalHelp) {
    return <ModalHelpTooltipPane />;
  }
  if (name === TooltipName.ModalPlanetDetails) {
    return <ModalPlanetDetailsTooltipPane />;
  }
  if (name === TooltipName.ModalLeaderboard) {
    return <ModalLeaderboardTooltipPane />;
  }
  if (name === TooltipName.ModalPlanetDex) {
    return <ModalPlanetDexTooltipPane />;
  }
  if (name === TooltipName.ModalUpgradeDetails) {
    return <ModalUpgradeDetailsTooltipPane />;
  }
  if (name === TooltipName.ModalTwitterVerification) {
    return <ModalTwitterVerificationTooltipPane />;
  }
  if (name === TooltipName.ModalTwitterBroadcast) {
    return <ModalBroadcastTooltipPane />;
  }
  if (name === TooltipName.Defense) {
    return <DefenseTooltipPane />;
  }
  if (name === TooltipName.SpaceJunk) {
    return <SpaceJunkTooltipPane />;
  }
  if (name === TooltipName.Abandon) {
    return <AbandonTooltipPane />;
  }
  if (name === TooltipName.Speed) {
    return <SpeedTooltipPane />;
  }
  if (name === TooltipName.ArtifactBuff) {
    return <ArtifactBuffPane />;
  }
  if (name === TooltipName.ModalPlugins) {
    return <PluginsTooltipPane />;
  }
  if (name === TooltipName.ModalSettings) {
    return <SettingsPane />;
  }
  if (name === TooltipName.ModalYourArtifacts) {
    return <YourArtifacts />;
  }
  if (name === TooltipName.ModalHats) {
    return <Hats />;
  }
  if (name === TooltipName.FindArtifact) {
    return <FindArtifact />;
  }
  if (name === TooltipName.ArtifactStored) {
    return <ArtifactStored />;
  }
  if (name === TooltipName.HashesPerSec) {
    return <HashesPerSec />;
  }
  if (name === TooltipName.ModalWithdrawSilver) {
    return <ModalWithdrawSilverTooltipPane />;
  }
  if (name === TooltipName.TimeUntilActivationPossible) {
    return <TimeUntilActivationPossiblePane />;
  }
  if (name === TooltipName.DepositArtifact) {
    return <DepositArtifactPane />;
  }
  if (name === TooltipName.DeactivateArtifact) {
    return <DeactivateArtifactPane />;
  }
  if (name === TooltipName.WithdrawArtifact) {
    return <WithdrawArtifactPane />;
  }
  if (name === TooltipName.ActivateArtifact) {
    return <ActivateArtifactPane />;
  }
  if (name === TooltipName.ChargeArtifact) {
    return <ChargeArtifactPane />;
  }
  if (name === TooltipName.ShutdownArtifact) {
    return <ShutdownArtifactPane />;
  }
  if (name === TooltipName.ArtifactCopyCharge) {
    return <ArtifactCopyChargePane />;
  }
  if (name === TooltipName.ArtifactCopyActivate) {
    return <ArtifactCopyActivatePane />;
  }
  if (name === TooltipName.ArtifactCopyShutdown) {
    return <ArtifactCopyShutdownPane />;
  }
  if (name === TooltipName.ArtifactCopyLand) {
    return <ArtifactCopyLandPane />;
  }
  if (name === TooltipName.ArtifactCarry) {
    return <ArtifactCarryPane />;
  }
  if (name === TooltipName.ArtifactHelpPinkBomb) {
    return <ArtifactHelpPinkBombPane />;
  }
  if (name === TooltipName.ArtifactHelpBloomFilter) {
    return <ArtifactHelpBloomFilterPane />;
  }
  if (name === TooltipName.ArtifactHelpWormhole) {
    return <ArtifactHelpWormholePane />;
  }
  if (name === TooltipName.ArtifactHelpCannon) {
    return <ArtifactHelpCannonPane />;
  }
  if (name === TooltipName.DefenseMultiplier) {
    return <DefenseMultiplierPane />;
  }
  if (name === TooltipName.EnergyCapMultiplier) {
    return <EnergyCapMultiplierPane />;
  }
  if (name === TooltipName.EnergyGrowthMultiplier) {
    return <EnergyGrowthMultiplierPane />;
  }
  if (name === TooltipName.RangeMultiplier) {
    return <RangeMultiplierPane />;
  }
  if (name === TooltipName.SpeedMultiplier) {
    return <SpeedMultiplierPane />;
  }
  if (name === TooltipName.NetworkHealth) {
    return <NetworkHealthPane />;
  }
  if (name === TooltipName.WithdrawSilverButton) {
    return <WithdrawSilverButton />;
  }
  if (name === TooltipName.RetryTransaction) {
    return <RetryTransactionPane />;
  }
  if (name === TooltipName.CancelTransaction) {
    return <CancelTransactionPane />;
  }
  if (name === TooltipName.PrioritizeTransaction) {
    return <PrioritizeTransactionPane />;
  }
  if (name === TooltipName.Invadable) {
    return <InvadablePane />;
  }
  if (name === TooltipName.Capturable) {
    return <CapturablePane />;
  }
  if (name === TooltipName.DropBombDisabled) {
    return <DropBombDisabled />;
  }
  if (name === TooltipName.DropBomb) {
    return <DropBomb />;
  }
  if (name === TooltipName.PinkDisabled) {
    return <PinkDisabled />;
  }
  if (name === TooltipName.Pink) {
    return <PinkButton />;
  }
  if (name === TooltipName.KardashevDisabled) {
    return <KardahsevDisabled />;
  }
  if (name === TooltipName.Kardashev) {
    return <Kardashev />;
  }
  if (name === TooltipName.BlueDisabled) {
    return <BlueDisabled />;
  }
  if (name === TooltipName.Blue) {
    return <BlueButton />;
  }
  if (name === TooltipName.BuyHat) {
    return <BuyHat />;
  }

  // Material tooltips
  if (name === TooltipName.MaterialWaterCrystals) {
    return <MaterialWaterCrystalsTooltip />;
  }
  if (name === TooltipName.MaterialLivingWood) {
    return <MaterialLivingWoodTooltip />;
  }
  if (name === TooltipName.MaterialWindsteel) {
    return <MaterialWindsteelTooltip />;
  }
  if (name === TooltipName.MaterialAurorium) {
    return <MaterialAuroriumTooltip />;
  }
  if (name === TooltipName.MaterialMycelium) {
    return <MaterialMyceliumTooltip />;
  }
  if (name === TooltipName.MaterialSandglass) {
    return <MaterialSandglassTooltip />;
  }
  if (name === TooltipName.MaterialCryostone) {
    return <MaterialCryostoneTooltip />;
  }
  if (name === TooltipName.MaterialScrapium) {
    return <MaterialScrapiumTooltip />;
  }
  if (name === TooltipName.MaterialPyrosteel) {
    return <MaterialPyrosteelTooltip />;
  }
  if (name === TooltipName.MaterialBlackalloy) {
    return <MaterialBlackalloyTooltip />;
  }
  if (name === TooltipName.MaterialCorruptedCrystal) {
    return <MaterialCorruptedCrystalTooltip />;
  }

  return <></>;
}
