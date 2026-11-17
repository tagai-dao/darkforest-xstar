import { EMPTY_ADDRESS } from "@df/constants";
import { isLocatable } from "@df/gamelogic";
import { getPlanetName } from "@df/procedural";
import { quoteSilverPurchase, SILVER_TIER_PERCENTS } from "@df/silverMarket";
import type { LocatablePlanet, Materials } from "@df/types";
import { PlanetType } from "@df/types";
import { useComponentValue } from "@latticexyz/react";
import { singletonEntity } from "@latticexyz/store-sync/recs";
import { useMUD } from "@mud/MUDContext";
import React, { useEffect, useLayoutEffect, useState } from "react";
import styled from "styled-components";

import {
  copyText,
  formatBuySilverOrder,
  formatUpgradeOrder,
  formatWithdrawMaterialOrder,
  formatWithdrawSilverOrder,
} from "../../Backend/GameLogic/moveOrder";
import { getPlanetMaxRank } from "../../Backend/Utils/Utils";
import { MATERIAL_NAME } from "../Components/OwnedPlanetsPanel";
import { useAccount, useSelectedPlanet, useUIManager } from "../Utils/AppHooks";
import { DFZIndex } from "../Utils/constants";
import UIEmitter, { UIEmitterEvent } from "../Utils/UIEmitter";
import { PlanetCard } from "../Views/PlanetCard";
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
        label: "已复制银换分单，直接粘贴给 agent",
      });
    });
  };

  return (
    <Sliders>
      <PercentRow
        label="出发能量"
        percent={energyPercent}
        amount={departureEnergy(planet.energy, energyPercent)}
        onChange={setEnergy}
      />
      {planet.silver > 0 && (
        <PercentRow
          label="出发银"
          percent={silverPercent}
          amount={departureSilver(planet, silverPercent)}
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
  onChange,
  verb = "派出",
  color,
}: {
  label: string;
  percent: number;
  amount: number;
  onChange: (percent: number) => void;
  verb?: string;
  // 和星球上直接显示的材料数字用同一种颜色。
  color?: string;
}) {
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
        本次{verb}{" "}
        {color ? (
          <MaterialNumber $color={color}>
            {amount.toLocaleString("zh-CN")}
          </MaterialNumber>
        ) : (
          amount.toLocaleString("zh-CN")
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
  const silverNeeded = nextUpgradeSilver(planet);
  const enoughSilver = planet.silver >= silverNeeded;
  const copyUpgrade = (branch: (typeof UPGRADE_BRANCHES)[number]) => {
    if (
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
        label: "已复制升级单，直接粘贴给 agent",
      });
    });
  };

  return (
    <BuyBox>
      <SectionTitle>升级</SectionTitle>
      {total >= maxRank ? (
        <Amount>三项升级已经满了</Amount>
      ) : (
        <>
          <Amount>
            下一档需要 {silverNeeded.toLocaleString("zh-CN")} 银
            {enoughSilver
              ? ""
              : `，还差 ${(silverNeeded - planet.silver).toLocaleString("zh-CN")}`}
          </Amount>
          {UPGRADE_BRANCHES.map((branch) => {
            const level = planet.upgradeState[branch.index] ?? 0;
            const branchFull = level >= MAX_BRANCH_LEVEL;
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
                  {branchFull ? "已满" : "复制升级"}
                </CopyScore>
              </TierLine>
            );
          })}
        </>
      )}
    </BuyBox>
  );
}

/**
 * 星球本身可以买银时，列出 4 档价格。点击只复制，agent 再去授权和购买。
 */
function SilverBuyCopy({ planet }: { planet: LocatablePlanet }) {
  const uiManager = useUIManager();
  const account = useAccount(uiManager);
  const {
    components: { DFXStarConfig, SilverFrontier },
  } = useMUD();
  const config = useComponentValue(DFXStarConfig, singletonEntity);
  const frontier =
    useComponentValue(SilverFrontier, singletonEntity)?.level ?? 0;
  const paymentToken = configuredAddress(config?.paymentToken);
  const buySilverSystem = configuredAddress(config?.buySilverSystem);
  const canBuy =
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
      planetId: planet.locationId,
      tier,
      priceWhole: quote.priceWhole,
      priceWei: quote.priceWei,
      silverDisplay: quote.silverDisplay,
      paymentToken,
      buySilverSystem,
      entryFeeWei: uiManager.getGameManager().getTransactionFee(),
    });
    void copyText(text).then((copied) => {
      UIEmitter.getInstance().emit(UIEmitterEvent.MoveOrderCopied, {
        text,
        copied,
        label: "已复制购银单，直接粘贴给 agent",
      });
    });
  };

  return (
    <BuyBox>
      <SectionTitle>购买银</SectionTitle>
      {frontier > planet.planetLevel && (
        <Amount>
          进度 {frontier} 级，本星按 {quotes[0].quote.percent}% 计价
        </Amount>
      )}
      {quotes.map(({ tier, quote }) => {
        const overCap = planet.silver + quote.silverDisplay > planet.silverCap;
        return (
          <TierLine key={tier}>
            <TierPrice>
              {SILVER_TIER_PERCENTS[tier]}%：
              {quote.priceWhole.toLocaleString("zh-CN")} AIPRO →{" "}
              {quote.silverDisplay.toLocaleString("zh-CN")} 银
              {overCap ? "，容量不足" : ""}
            </TierPrice>
            <CopyScore
              type="button"
              disabled={overCap}
              onClick={() => copyTier(tier)}
            >
              复制购买
            </CopyScore>
          </TierLine>
        );
      })}
    </BuyBox>
  );
}

/**
 * 点中星球后固定在屏幕右边，排在右上角相关信息的下面。
 */
export function SelectedPlanetSidePane() {
  const uiManager = useUIManager();
  const planet = useSelectedPlanet(uiManager);
  const selected = planet.value;
  const [top, setTop] = useState(DEFAULT_TOP);

  // 相关信息的行数会变，量它的底边，避免星球详情盖住它。
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

  return (
    <Side $top={top}>
      <Name>{getPlanetName(selected)}</Name>
      <Coords>
        坐标 {formatCoord(x)}, {formatCoord(y)}
      </Coords>
      <DepartureSliders planet={selected} />
      <SilverBuyCopy planet={selected} />
      <UpgradeCopy planet={selected} />
      <PlanetCard planetWrapper={planet} />
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
  background: rgba(8, 12, 18, 0.94);
  border: 1px solid #3d4d63;
  color: #e8eef7;
`;

const Name = styled.div`
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 8px;
`;

const Coords = styled.div`
  margin-bottom: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  color: #9be7ff;
`;

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
`;

const Step = styled.button`
  width: 28px;
  height: 28px;
  color: #e8eef7;
  background: transparent;
  border: 1px solid #3d4d63;
  cursor: pointer;
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

const TierPrice = styled.div`
  font-size: 12px;
  line-height: 1.4;
`;

const CopyScore = styled.button`
  height: 28px;
  color: #e8eef7;
  background: transparent;
  border: 1px solid #3d4d63;
  cursor: pointer;

  &:disabled {
    color: #6d7b8c;
    cursor: default;
  }
`;
