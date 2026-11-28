import { EMPTY_ADDRESS } from "@df/constants";
import { isLocatable } from "@df/gamelogic";
import { getPlanetName } from "@df/procedural";
import { quoteSilverPurchase } from "@df/silverMarket";
import type { LocatablePlanet, Materials } from "@df/types";
import { PlanetType } from "@df/types";
import { useComponentValue } from "@latticexyz/react";
import { singletonEntity } from "@latticexyz/store-sync/recs";
import { useMUD } from "@mud/MUDContext";
import React, { useEffect, useLayoutEffect, useState } from "react";
import styled from "styled-components";

import {
  copyText,
  formatAddJunkOrder,
  formatBuySilverOrder,
  formatClearJunkOrder,
  formatFindArtifactOrder,
  formatUpgradeOrder,
  formatWithdrawMaterialOrder,
  formatWithdrawSilverOrder,
} from "../../Backend/GameLogic/moveOrder";
import { getPlanetMaxRank } from "../../Backend/Utils/Utils";
import { PlanetArtifactUse } from "../Components/ArtifactUseActions";
import { MATERIAL_NAME } from "../Components/OwnedPlanetsPanel";
import { useAccount, useSelectedPlanet, useUIManager } from "../Utils/AppHooks";
import { DFZIndex } from "../Utils/constants";
import { useEmitterValue } from "../Utils/EmitterHooks";
import UIEmitter, { UIEmitterEvent } from "../Utils/UIEmitter";
import { PlanetCard, PlanetCardMetadata } from "../Views/PlanetCard";
import { getMaterialColor } from "./PlanetMaterialsPane";

const STATUS_SELECTOR = "[data-public-status]";
const PANEL_GAP = 8;
const DEFAULT_TOP = 72;

// 坐标按原值显示，最多两位小数，避免四舍五入把邻近的星球看成同一个点。
function formatCoord(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

// 和拖动复制时的计算一致：能量最多按 98% 派，并且至少留 1 点。
function departureEnergy(current: number, percent: number): number {
  const capped = Math.min(percent, 98);
  let amount = Math.floor((current * capped) / 100);
  if (amount >= current) {
    amount = Math.max(0, current - 1);
  }
  return amount;
}

function departureSilver(planet: LocatablePlanet, percent: number): number {
  let used = percent;
  if (
    used > 98 &&
    planet.planetType === PlanetType.SILVER_MINE &&
    planet.silver < planet.silverCap
  ) {
    used = 98;
  }
  return Math.floor((planet.silver * used) / 100);
}

function heldMaterials(planet: LocatablePlanet): Materials[] {
  return (planet.materials ?? []).filter(
    (material) =>
      material &&
      material.materialId !== 0 &&
      Number(material.materialAmount) > 0,
  );
}

function materialName(materialId: number): string {
  return MATERIAL_NAME[materialId] ?? `材料${materialId}`;
}

function portion(current: number, percent: number): number {
  return Math.floor((Number(current) * clampPercent(percent)) / 100);
}

// 合约要求提取量至少是上限的五分之一。银和材料用同一条规则。
function canConvertToScore(amount: number, cap: number): boolean {
  return amount > 0 && amount * 5 >= cap;
}

function DepartureSliders({ planet }: { planet: LocatablePlanet }) {
  const uiManager = useUIManager();
  const [energyPercent, setEnergyPercent] = useState(50);
  const [silverPercent, setSilverPercent] = useState(0);
  const [carryPercents, setCarryPercents] = useState<Record<number, number>>(
    {},
  );
  const [scorePercents, setScorePercents] = useState<Record<number, number>>(
    {},
  );
  const [silverScorePercent, setSilverScorePercent] = useState(0);
  const materials = heldMaterials(planet);
  const materialKey = materials
    .map((material) => material.materialId)
    .join(",");
  const isRip = planet.planetType === PlanetType.TRADING_POST;

  // 只在换星球或材料种类变化时读回比例，避免能量刷新把滑条打回零。
  useEffect(() => {
    setEnergyPercent(uiManager.getForcesSending(planet.locationId));
    setSilverPercent(uiManager.getSilverSending(planet.locationId));
    const next: Record<number, number> = {};
    for (const material of heldMaterials(planet)) {
      next[material.materialId] = uiManager.getMaterialSending(
        planet.locationId,
        material.materialId,
      );
    }
    setCarryPercents(next);
    setScorePercents({});
    setSilverScorePercent(0);
  }, [planet.locationId, materialKey, uiManager]);

  if (!uiManager.canLaunchFrom(planet)) {
    return null;
  }

  const setEnergy = (percent: number) => {
    const next = clampPercent(percent);
    setEnergyPercent(next);
    uiManager.setForcesSending(planet.locationId, next);
  };
  const setSilver = (percent: number) => {
    const next = clampPercent(percent);
    setSilverPercent(next);
    uiManager.setSilverSending(planet.locationId, next);
  };
  const setCarry = (materialId: number, percent: number) => {
    const next = clampPercent(percent);
    setCarryPercents((current) => ({ ...current, [materialId]: next }));
    uiManager.setMaterialSending(planet.locationId, materialId, next);
  };
  const copyScore = (material: Materials) => {
    const amount = portion(
      material.materialAmount,
      scorePercents[material.materialId] ?? 0,
    );
    if (!canConvertToScore(amount, Number(material.cap))) {
      return;
    }
    const text = formatWithdrawMaterialOrder({
      planetId: planet.locationId,
      materialType: material.materialId,
      displayAmount: amount,
      entryFeeWei: uiManager.getGameManager().getTransactionFee(),
    });
    void copyText(text).then((copied) => {
      UIEmitter.getInstance().emit(UIEmitterEvent.MoveOrderCopied, {
        text,
        copied,
        kind: "convert-score",
        label: "已复制换分单，直接粘贴给 agent",
      });
    });
  };
  const silverScoreAmount = portion(planet.silver, silverScorePercent);
  const silverScoreReady = canConvertToScore(
    silverScoreAmount,
    planet.silverCap,
  );
  const copySilverScore = () => {
    if (!silverScoreReady) {
      return;
    }
    const text = formatWithdrawSilverOrder({
      planetId: planet.locationId,
      displayAmount: silverScoreAmount,
      entryFeeWei: uiManager.getGameManager().getTransactionFee(),
    });
    void copyText(text).then((copied) => {
      UIEmitter.getInstance().emit(UIEmitterEvent.MoveOrderCopied, {
        text,
        copied,
        kind: "convert-score",
        label: "已复制银换分单，直接粘贴给 agent",
      });
    });
  };

  return (
    <Sliders>
      <div data-guide-target="departure-energy">
        <PercentRow
          label="出发能量"
          percent={energyPercent}
          amount={departureEnergy(planet.energy, energyPercent)}
          availableAmount={departureEnergy(planet.energy, 100)}
          onChange={setEnergy}
        />
      </div>
      {planet.silver > 0 && (
        <PercentRow
          label="出发银"
          percent={silverPercent}
          amount={departureSilver(planet, silverPercent)}
          availableAmount={departureSilver(planet, 100)}
          onChange={setSilver}
        />
      )}
      {planet.planetType === PlanetType.SILVER_MINE && planet.silver > 0 && (
        <Amount>
          银矿上的银要先用出发银拖到自己的时空裂隙。银到达后，打开那颗裂隙，点复制换分，分数会质押进池子。
        </Amount>
      )}
      {isRip && planet.silver > 0 && (
        <Row>
          <SectionTitle>银换成分数</SectionTitle>
          <PercentRow
            label="提取银"
            verb="提取"
            percent={silverScorePercent}
            amount={silverScoreAmount}
            onChange={(percent) => setSilverScorePercent(clampPercent(percent))}
          />
          <Amount>
            {silverScoreReady ? (
              "达到上限的五分之一，可以复制换分"
            ) : (
              <>
                至少要到{" "}
                {Math.ceil(planet.silverCap / 5).toLocaleString("zh-CN")}
              </>
            )}
          </Amount>
          <CopyScore
            type="button"
            data-guide-target="convert-score"
            disabled={!silverScoreReady}
            onClick={copySilverScore}
          >
            复制换分
          </CopyScore>
        </Row>
      )}
      <SectionTitle>带走材料</SectionTitle>
      {materials.length === 0 ? (
        <Amount>这颗星球上没有材料</Amount>
      ) : (
        materials.map((material) => (
          <PercentRow
            key={material.materialId}
            label={`带走${materialName(material.materialId)}`}
            color={getMaterialColor(material.materialId)}
            percent={carryPercents[material.materialId] ?? 0}
            amount={portion(
              material.materialAmount,
              carryPercents[material.materialId] ?? 0,
            )}
            availableAmount={portion(material.materialAmount, 100)}
            onChange={(percent) => setCarry(material.materialId, percent)}
          />
        ))
      )}
      {isRip && materials.length > 0 && (
        <>
          <SectionTitle>换成分数</SectionTitle>
          {materials.map((material) => {
            const percent = scorePercents[material.materialId] ?? 0;
            const amount = portion(material.materialAmount, percent);
            const ready = canConvertToScore(amount, Number(material.cap));
            const color = getMaterialColor(material.materialId);
            return (
              <Row key={`score-${material.materialId}`}>
                <PercentRow
                  label={`提取${materialName(material.materialId)}`}
                  verb="提取"
                  color={color}
                  percent={percent}
                  amount={amount}
                  onChange={(next) =>
                    setScorePercents((current) => ({
                      ...current,
                      [material.materialId]: clampPercent(next),
                    }))
                  }
                />
                <Amount>
                  {ready ? (
                    "达到上限的五分之一，可以复制换分"
                  ) : (
                    <>
                      至少要到{" "}
                      <MaterialNumber $color={color}>
                        {Math.ceil(Number(material.cap) / 5).toLocaleString(
                          "zh-CN",
                        )}
                      </MaterialNumber>
                    </>
                  )}
                </Amount>
                <CopyScore
                  type="button"
                  data-guide-target="convert-score"
                  disabled={!ready}
                  onClick={() => copyScore(material)}
                >
                  复制换分
                </CopyScore>
              </Row>
            );
          })}
        </>
      )}
    </Sliders>
  );
}

function clampPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  return Math.max(0, Math.min(100, Math.round(percent)));
}

function PercentRow({
  label,
  percent,
  amount,
  availableAmount,
  onChange,
  verb = "派出",
  color,
}: {
  label: string;
  percent: number;
  amount: number;
  availableAmount?: number;
  onChange: (percent: number) => void;
  verb?: string;
  // 和星球上直接显示的材料数字用同一种颜色。
  color?: string;
}) {
  const amountText =
    availableAmount === undefined
      ? amount.toLocaleString("zh-CN")
      : `${amount}/${availableAmount}`;
  return (
    <Row>
      <RowLabel>
        {label}{" "}
        {color ? (
          <MaterialNumber $color={color}>{percent}%</MaterialNumber>
        ) : (
          `${percent}%`
        )}
      </RowLabel>
      <Controls>
        <Step type="button" onClick={() => onChange(percent - 1)}>
          -
        </Step>
        <Range
          type="range"
          min={0}
          max={100}
          value={percent}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <Step type="button" onClick={() => onChange(percent + 1)}>
          +
        </Step>
      </Controls>
      <Amount>
        本次{verb}
        {availableAmount === undefined ? " " : "："}
        {color ? (
          <MaterialNumber $color={color}>{amountText}</MaterialNumber>
        ) : (
          amountText
        )}
      </Amount>
    </Row>
  );
}

function sameAddress(left?: string, right?: string): boolean {
  return !!left && !!right && left.toLowerCase() === right.toLowerCase();
}

function configuredAddress(value: unknown): string | undefined {
  if (typeof value !== "string" || value === EMPTY_ADDRESS) return undefined;
  return value;
}

const UPGRADE_BRANCHES = [
  { name: "防御", index: 0, rangeTimes: 0, speedTimes: 0, defenseTimes: 1 },
  { name: "射程", index: 1, rangeTimes: 1, speedTimes: 0, defenseTimes: 0 },
  { name: "速度", index: 2, rangeTimes: 0, speedTimes: 1, defenseTimes: 0 },
] as const;

const MAX_BRANCH_LEVEL = 4;

function nextUpgradeSilver(planet: LocatablePlanet): number {
  const total = planet.upgradeState.reduce((sum, level) => sum + level, 0);
  return Math.floor((total + 1) * 0.2 * planet.silverCap);
}

/**
 * 普通星球银够下一档时，可以复制射程、速度或防御的升级。
 */
function UpgradeCopy({ planet }: { planet: LocatablePlanet }) {
  const uiManager = useUIManager();
  const account = useAccount(uiManager);
  const owned =
    sameAddress(planet.owner, account) &&
    sameAddress(planet.junkOwner, account);
  const canUpgrade =
    owned &&
    planet.planetType === PlanetType.PLANET &&
    planet.planetLevel > 0 &&
    !planet.destroyed &&
    !planet.frozen;
  if (!canUpgrade) return null;

  const total = planet.upgradeState.reduce((sum, level) => sum + level, 0);
  const maxRank = getPlanetMaxRank(planet);
  const planetFull = total >= maxRank;
  const silverNeeded = nextUpgradeSilver(planet);
  const enoughSilver = planet.silver >= silverNeeded;
  const copyUpgrade = (branch: (typeof UPGRADE_BRANCHES)[number]) => {
    if (
      planetFull ||
      !enoughSilver ||
      planet.upgradeState[branch.index] >= MAX_BRANCH_LEVEL
    ) {
      return;
    }
    const text = formatUpgradeOrder({
      planetId: planet.locationId,
      rangeTimes: branch.rangeTimes,
      speedTimes: branch.speedTimes,
      defenseTimes: branch.defenseTimes,
      entryFeeWei: uiManager.getGameManager().getTransactionFee(),
    });
    void copyText(text).then((copied) => {
      UIEmitter.getInstance().emit(UIEmitterEvent.MoveOrderCopied, {
        text,
        copied,
        kind: "upgrade",
        label: "已复制升级单，直接粘贴给 agent",
      });
    });
  };

  return (
    <BuyBox data-guide-target="upgrade">
      <SectionTitle>升级</SectionTitle>
      {planetFull ? (
        <Amount>已满级</Amount>
      ) : (
        <Amount>
          下一档需要 {silverNeeded.toLocaleString("zh-CN")} 银
          {enoughSilver
            ? ""
            : `，还差 ${(silverNeeded - planet.silver).toLocaleString("zh-CN")}`}
        </Amount>
      )}
      {/* 升满后仍列出每一项的等级，避免只剩一句“已经满了”。 */}
      {UPGRADE_BRANCHES.map((branch) => {
        const level = planet.upgradeState[branch.index] ?? 0;
        const branchFull = level >= MAX_BRANCH_LEVEL || planetFull;
        return (
          <TierLine key={branch.name}>
            <TierPrice>
              {branch.name} {level}/{MAX_BRANCH_LEVEL}
            </TierPrice>
            <CopyScore
              type="button"
              disabled={!enoughSilver || branchFull}
              onClick={() => copyUpgrade(branch)}
            >
              {branchFull ? "已满" : "升级"}
            </CopyScore>
          </TierLine>
        );
      })}
    </BuyBox>
  );
}

/**
 * 自己占领的星球可以复制登记和清除。清除自己的星球会把它放弃。
 */
function JunkCopy({ planet }: { planet: LocatablePlanet }) {
  const uiManager = useUIManager();
  const account = useAccount(uiManager);
  const owned = sameAddress(planet.owner, account);
  if (!owned) return null;

  const junkIsMine = sameAddress(planet.junkOwner, account);
  const copyAdd = () => {
    const hashConfig = uiManager.getHashConfig();
    const text = formatAddJunkOrder({
      planetId: planet.locationId,
      x: planet.location.coords.x,
      y: planet.location.coords.y,
      biomebase: planet.location.biomebase,
      planetHashKey: hashConfig.planetHashKey,
      biomebaseKey: hashConfig.biomebaseKey,
      scale: hashConfig.perlinLengthScale,
      mirrorX: hashConfig.perlinMirrorX,
      mirrorY: hashConfig.perlinMirrorY,
      entryFeeWei: uiManager.getGameManager().getTransactionFee(),
    });
    void copyText(text).then((copied) => {
      UIEmitter.getInstance().emit(UIEmitterEvent.MoveOrderCopied, {
        text,
        copied,
        kind: "add-junk",
        label: "已复制登记单，直接粘贴给 agent",
      });
    });
  };
  const copyClear = () => {
    if (!junkIsMine) return;
    const text = formatClearJunkOrder({
      planetId: planet.locationId,
      ownsPlanet: true,
      entryFeeWei: uiManager.getGameManager().getTransactionFee(),
    });
    void copyText(text).then((copied) => {
      UIEmitter.getInstance().emit(UIEmitterEvent.MoveOrderCopied, {
        text,
        copied,
        label: "已复制清除单，直接粘贴给 agent",
      });
    });
  };

  return (
    <BuyBox>
      <SectionTitle>垃圾配额</SectionTitle>
      <TierLine>
        <TierPrice>{junkIsMine ? "已经登记" : "占领后还没登记"}</TierPrice>
        <CopyScore
          type="button"
          data-guide-target={junkIsMine ? undefined : "add-junk"}
          onClick={copyAdd}
        >
          登记
        </CopyScore>
      </TierLine>
      <TierLine>
        <TierPrice>
          {junkIsMine ? "清除后会放弃这颗星球" : "垃圾不在自己名下"}
        </TierPrice>
        <CopyScore type="button" disabled={!junkIsMine} onClick={copyClear}>
          取消登记
        </CopyScore>
      </TierLine>
    </BuyBox>
  );
}

function artifactCopyHint(
  junkIsMine: boolean,
  phase: "found" | "find" | "prospect-then-find",
): string {
  if (!junkIsMine) return "先登记垃圾配额";
  if (phase === "find") return "勘探窗口还开着，这次只发现";
  return "先勘探，上链后立刻发现";
}

// 合约的发现窗口是勘探区块到其后 256 个区块，两端都算。过了才能重新勘探。
function artifactPhase(
  planet: LocatablePlanet,
  blockNumber: number | undefined,
): "found" | "find" | "prospect-then-find" {
  if (planet.hasTriedFindingArtifact) {
    return "found";
  }
  const prospectedAt = planet.prospectedBlockNumber;
  if (
    prospectedAt &&
    blockNumber !== undefined &&
    blockNumber <= prospectedAt + 256
  ) {
    return "find";
  }
  return "prospect-then-find";
}

/**
 * 自己的铸造厂复制获得神器。页面不签名，agent 先勘探再发现。
 */
function ArtifactCopy({ planet }: { planet: LocatablePlanet }) {
  const uiManager = useUIManager();
  const account = useAccount(uiManager);
  const blockNumber = useEmitterValue(
    uiManager.getEthConnection().blockNumber$,
    undefined,
  );
  if (planet.planetType !== PlanetType.RUINS) return null;
  if (!sameAddress(planet.owner, account)) return null;
  if (planet.destroyed || planet.frozen) return null;

  const junkIsMine = sameAddress(planet.junkOwner, account);
  const phase = artifactPhase(planet, blockNumber);
  const copyArtifact = () => {
    if (!junkIsMine || phase === "found") return;
    const hashConfig = uiManager.getHashConfig();
    const text = formatFindArtifactOrder({
      planetId: planet.locationId,
      x: planet.location.coords.x,
      y: planet.location.coords.y,
      biomebase: planet.location.biomebase,
      planetHashKey: hashConfig.planetHashKey,
      biomebaseKey: hashConfig.biomebaseKey,
      scale: hashConfig.perlinLengthScale,
      mirrorX: hashConfig.perlinMirrorX,
      mirrorY: hashConfig.perlinMirrorY,
      phase,
      entryFeeWei: uiManager.getGameManager().getTransactionFee(),
    });
    void copyText(text).then((copied) => {
      UIEmitter.getInstance().emit(UIEmitterEvent.MoveOrderCopied, {
        text,
        copied,
        label: "已复制神器单，直接粘贴给 agent",
      });
    });
  };

  return (
    <BuyBox>
      <SectionTitle>神器</SectionTitle>
      {phase === "found" ? (
        <Amount>已经发现过神器</Amount>
      ) : (
        <TierLine>
          <TierPrice>{artifactCopyHint(junkIsMine, phase)}</TierPrice>
          <CopyScore
            type="button"
            disabled={!junkIsMine}
            onClick={copyArtifact}
          >
            复制获得神器
          </CopyScore>
        </TierLine>
      )}
    </BuyBox>
  );
}

/**
 * 星球本身可以买银时，列出 4 档价格。点击只复制，agent 再去授权和购买。
 */
function SilverBuyCopy({ planet }: { planet: LocatablePlanet }) {
  const uiManager = useUIManager();
  const gameManager = uiManager.getGameManager();
  const account = useAccount(uiManager);
  const {
    network: { publicClient, worldAddress: syncedWorldAddress },
    components: { DFXStarConfig, SilverFrontier },
  } = useMUD();
  const worldAddress = gameManager.getContractAddress();
  const config = useComponentValue(DFXStarConfig, singletonEntity);
  const frontier =
    useComponentValue(SilverFrontier, singletonEntity)?.level ?? 0;
  const paymentToken = configuredAddress(config?.paymentToken);
  const buySilverSystem = configuredAddress(config?.buySilverSystem);
  const canBuy =
    sameAddress(worldAddress, syncedWorldAddress) &&
    planet.planetType !== PlanetType.TRADING_POST &&
    planet.planetLevel >= 1 &&
    planet.addJunkTick > 0 &&
    !planet.destroyed &&
    !planet.frozen &&
    sameAddress(planet.owner, account) &&
    sameAddress(planet.junkOwner, account) &&
    !!paymentToken &&
    !!buySilverSystem;
  const quotes = [0, 1, 2, 3].flatMap((tier) => {
    const quote = quoteSilverPurchase(planet.planetLevel, tier, frontier);
    return quote ? [{ tier, quote }] : [];
  });

  if (!canBuy || quotes.length !== 4 || !paymentToken || !buySilverSystem) {
    return null;
  }

  const copyTier = (tier: number) => {
    const quote = quotes.find((item) => item.tier === tier)?.quote;
    if (!quote || planet.silver + quote.silverDisplay > planet.silverCap) {
      return;
    }
    const text = formatBuySilverOrder({
      chainId: publicClient.chain.id,
      worldAddress,
      planetId: planet.locationId,
      tier,
      priceWhole: quote.priceWhole,
      priceWei: quote.priceWei,
      silverDisplay: quote.silverDisplay,
      paymentToken,
      buySilverSystem,
      entryFeeWei: gameManager.getTransactionFee(),
    });
    void copyText(text).then((copied) => {
      UIEmitter.getInstance().emit(UIEmitterEvent.MoveOrderCopied, {
        text,
        copied,
        kind: "buy-silver",
        label: "已复制购银单，直接粘贴给 agent",
      });
    });
  };

  return (
    <BuyBox data-guide-target="buy-silver">
      <SectionTitle>购买银</SectionTitle>
      {frontier > planet.planetLevel && (
        <Amount>
          进度 {frontier} 级，本星按 {quotes[0].quote.percent}% 计价
        </Amount>
      )}
      {/* 四档直接是按钮。主标题是银，副标题是要付的 AIPRO。点下去仍只复制购银单。 */}
      <SilverTiers>
        {quotes.map(({ tier, quote }) => {
          const overCap =
            planet.silver + quote.silverDisplay > planet.silverCap;
          return (
            <SilverTierButton
              key={tier}
              type="button"
              disabled={overCap}
              title={overCap ? "容量不足" : "复制购买"}
              onClick={() => copyTier(tier)}
            >
              <SilverTierAmount>
                {quote.silverDisplay.toLocaleString("zh-CN")} 银
              </SilverTierAmount>
              <SilverTierCost>
                {quote.priceWhole.toLocaleString("zh-CN")} AIPRO
              </SilverTierCost>
            </SilverTierButton>
          );
        })}
      </SilverTiers>
    </BuyBox>
  );
}

/**
 * 点中星球后固定在屏幕右边，排在右上角游戏信息的下面。
 */
export function SelectedPlanetSidePane() {
  const uiManager = useUIManager();
  const planet = useSelectedPlanet(uiManager);
  const selected = planet.value;
  const [top, setTop] = useState(DEFAULT_TOP);

  // 游戏信息的行数会变，量它的底边，避免星球详情盖住它。
  useLayoutEffect(() => {
    const panel = document.querySelector(STATUS_SELECTOR);
    if (!(panel instanceof HTMLElement)) {
      setTop(DEFAULT_TOP);
      return;
    }
    const place = () => {
      setTop(Math.round(panel.getBoundingClientRect().bottom) + PANEL_GAP);
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  if (!selected || !isLocatable(selected)) return null;

  const { x, y } = selected.location.coords;
  const copyIdentity = (text: string, label: string) => {
    void copyText(text).then((copied) => {
      UIEmitter.getInstance().emit(UIEmitterEvent.MoveOrderCopied, {
        text,
        copied,
        label,
      });
    });
  };

  return (
    <Side $top={top} data-guide-panel="planet-details">
      <Name>{getPlanetName(selected)}</Name>
      <PlanetCardMetadata planet={selected} />
      <Coords>
        <span>
          坐标 {formatCoord(x)}, {formatCoord(y)}
        </span>
        <CopyCoordButton
          type="button"
          title="复制坐标"
          aria-label="复制坐标"
          onClick={() =>
            copyIdentity(`${formatCoord(x)}, ${formatCoord(y)}`, "已复制坐标")
          }
        >
          <CopyCoordIcon />
        </CopyCoordButton>
        <CopyHashButton
          type="button"
          title="复制星球 Hash"
          onClick={() => copyIdentity(selected.locationId, "已复制星球 Hash")}
        >
          复制 Hash
        </CopyHashButton>
      </Coords>
      <DepartureSliders planet={selected} />
      <JunkCopy planet={selected} />
      <ArtifactCopy planet={selected} />
      <PlanetArtifactUse planet={selected} />
      <SilverBuyCopy planet={selected} />
      <UpgradeCopy planet={selected} />
      <PlanetCard planetWrapper={planet} showIdentity={false} />
    </Side>
  );
}

const Side = styled.aside<{ $top: number }>`
  position: fixed;
  top: ${(props) => props.$top}px;
  right: 16px;
  z-index: ${DFZIndex.Tooltip};
  width: 320px;
  max-height: calc(100vh - ${(props) => props.$top + 16}px);
  overflow: auto;
  padding: 12px;
  box-sizing: border-box;
  pointer-events: auto;
  background: linear-gradient(155deg, rgb(19 32 51 / 97%), rgb(10 17 29 / 97%));
  border: 1px solid #324961;
  border-radius: 9px;
  box-shadow: 0 14px 34px rgb(2 5 12 / 38%);
  color: #e8eef7;
  font-family: system-ui, "PingFang SC", sans-serif;
  font-variant-numeric: tabular-nums;
`;

const Name = styled.div`
  margin-bottom: 7px;
  color: #f0f6ff;
  font-size: 16px;
  font-weight: 700;
`;

const Coords = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 5px 0 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  color: #9be7ff;
`;

const CopyCoordButton = styled.button`
  display: inline-flex;
  padding: 0;
  color: #9be7ff;
  background: transparent;
  border: 0;
  cursor: pointer;
`;

const CopyHashButton = styled(CopyCoordButton)`
  align-items: center;
  padding: 2px 5px;
  border: 1px solid #385470;
  border-radius: 4px;
  font: inherit;
  font-size: 11px;
  white-space: nowrap;

  &:hover {
    background: #21384e;
  }
`;

function CopyCoordIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <rect
        x="4.5"
        y="4.5"
        width="7"
        height="7"
        fill="none"
        stroke="currentColor"
      />
      <rect
        x="2.5"
        y="2.5"
        width="7"
        height="7"
        fill="#101820"
        stroke="currentColor"
      />
    </svg>
  );
}

const Sliders = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
`;

const Row = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const RowLabel = styled.div`
  font-size: 13px;
`;

const Controls = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const Range = styled.input`
  flex: 1;
  min-width: 0;
  accent-color: #75e5db;
`;

const Step = styled.button`
  width: 28px;
  height: 28px;
  color: #e8eef7;
  background: #132437;
  border: 1px solid #354e68;
  border-radius: 5px;
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: #8ce3e1;
  }
`;

const Amount = styled.div`
  font-size: 12px;
  color: #9be7ff;
`;

const MaterialNumber = styled.span<{ $color: string }>`
  color: ${(props) => props.$color};
  font-weight: 700;
`;

const SectionTitle = styled.div`
  margin-top: 4px;
  font-size: 13px;
  font-weight: 700;
`;

const BuyBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
`;

const TierLine = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`;

const SilverTiers = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
`;

const SilverTierButton = styled.button`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
  padding: 8px;
  color: #e8eef7;
  background: #132437;
  border: 1px solid #354e68;
  border-radius: 5px;
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: #8ce3e1;
  }
  text-align: left;

  &:disabled {
    color: #6d7b8c;
    cursor: default;
  }
`;

const SilverTierAmount = styled.span`
  font-size: 15px;
  font-weight: 700;
  line-height: 1.2;
`;

const SilverTierCost = styled.span`
  font-size: 11px;
  line-height: 1.3;
  color: #9be7ff;

  ${SilverTierButton}:disabled & {
    color: #6d7b8c;
  }
`;

const TierPrice = styled.div`
  font-size: 12px;
  line-height: 1.4;
`;

const CopyScore = styled.button`
  height: 28px;
  color: #e8eef7;
  background: #132437;
  border: 1px solid #354e68;
  border-radius: 5px;
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: #8ce3e1;
  }

  &:disabled {
    color: #6d7b8c;
    cursor: default;
  }
`;
