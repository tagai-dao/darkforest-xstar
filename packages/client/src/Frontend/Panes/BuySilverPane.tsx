import { EMPTY_ADDRESS } from "@df/constants";
import { quoteSilverPurchase } from "@df/silverMarket";
import type { Planet } from "@df/types";
import { PlanetType } from "@df/types";
import { useComponentValue } from "@latticexyz/react";
import { singletonEntity } from "@latticexyz/store-sync/recs";
import { useMUD } from "@mud/MUDContext";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { type Address, parseAbi, zeroAddress } from "viem";
import { usePublicClient } from "wagmi";

import {
  copyText,
  formatBuySilverOrder,
} from "../../Backend/GameLogic/moveOrder";
import type { Wrapper } from "../../Backend/Utils/Wrapper";
import { Red, Text } from "../Components/Text";
import dfstyles from "../Styles/dfstyles";
import { useAccount, useUIManager } from "../Utils/AppHooks";
import UIEmitter, { UIEmitterEvent } from "../Utils/UIEmitter";

const POOL_ABI = parseAbi([
  "function getTotalStakedAmount() external view returns (uint256)",
]);

const ERC20_ABI = parseAbi(["function symbol() view returns (string)"]);

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
  padding: 10px;
  border: 1px solid ${dfstyles.colors.border};
  border-radius: 6px;
  background: ${dfstyles.colors.backgrounddark};
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
  color: ${dfstyles.colors.text};
  background: transparent;
  border: 1px solid ${dfstyles.colors.border};
  border-radius: ${dfstyles.borderRadius};
  cursor: pointer;
  text-align: left;

  &:hover:not(:disabled) {
    border-color: ${dfstyles.colors.dfblue};
  }

  &:disabled {
    color: ${dfstyles.colors.subtext};
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
  color: ${dfstyles.colors.dfblue};

  ${SilverTierButton}:disabled & {
    color: ${dfstyles.colors.subtext};
  }
`;

type Props = {
  planetWrapper: Wrapper<Planet | undefined>;
};

export function BuySilverPane({
  planetWrapper,
}: Props): React.ReactElement | null {
  const uiManager = useUIManager();
  const gameManager = uiManager.getGameManager();
  const account = useAccount(uiManager);
  const publicClient = usePublicClient();
  const {
    network: { publicClient: mudClient, worldAddress: syncedWorldAddress },
    components: { DFXStarConfig, SilverFrontier },
  } = useMUD();
  const worldAddress = gameManager.getContractAddress();
  const isSyncedWorld =
    worldAddress.toLowerCase() === syncedWorldAddress.toLowerCase();

  const dfxConfig = useComponentValue(DFXStarConfig, singletonEntity);
  const frontier =
    useComponentValue(SilverFrontier, singletonEntity)?.level ?? 0;

  const [totalStaked, setTotalStaked] = useState<bigint | null>(null);
  const [tokenSymbol, setTokenSymbol] = useState("TOKEN");

  const planet = planetWrapper.value;
  const paymentToken = dfxConfig?.paymentToken as Address | undefined;
  const buySilverSpender = dfxConfig?.buySilverSystem as Address | undefined;
  const pool = dfxConfig?.scoreStakingPool as Address | undefined;

  const level = planet?.planetLevel ?? 0;
  const tiers = useMemo(() => {
    return [0, 1, 2, 3].flatMap((tier) => {
      const quote = quoteSilverPurchase(level, tier, frontier);
      if (!quote) return [];
      return [
        {
          tier,
          price: quote.priceWei,
          silver: quote.silverDisplay,
          priceLabel: quote.priceWhole.toLocaleString(),
          percent: quote.percent,
        },
      ];
    });
  }, [frontier, level]);

  const refreshPoolState = useCallback(async () => {
    if (!publicClient || !pool || pool === zeroAddress) {
      setTotalStaked(null);
      return;
    }
    const staked = await publicClient.readContract({
      address: pool,
      abi: POOL_ABI,
      functionName: "getTotalStakedAmount",
    });
    setTotalStaked(staked);
  }, [publicClient, pool]);

  const refreshTokenState = useCallback(async () => {
    if (!publicClient || !paymentToken || paymentToken === zeroAddress) {
      return;
    }
    const symbol = await publicClient.readContract({
      address: paymentToken,
      abi: ERC20_ABI,
      functionName: "symbol",
    });
    setTokenSymbol(symbol);
  }, [publicClient, paymentToken]);

  useEffect(() => {
    refreshPoolState().catch(() => undefined);
    refreshTokenState().catch(() => undefined);
  }, [refreshPoolState, refreshTokenState]);

  const junkReady =
    planet &&
    planet.junkOwner === account &&
    planet.addJunkTick > 0 &&
    planet.owner === account;

  const canShow =
    isSyncedWorld &&
    planet &&
    !planet.destroyed &&
    !planet.frozen &&
    planet.planetType !== PlanetType.TRADING_POST &&
    junkReady &&
    paymentToken &&
    paymentToken !== EMPTY_ADDRESS &&
    buySilverSpender &&
    buySilverSpender !== EMPTY_ADDRESS;

  if (!canShow) {
    return null;
  }

  if (level < 1) {
    return (
      <Container>
        <Text>购银（DFXStar）</Text>
        <Text>0 级星球没有购银档位。</Text>
      </Container>
    );
  }

  const stakingActive = totalStaked !== null && totalStaked > 0n;
  const configReady = Boolean(
    pool && pool !== zeroAddress && tiers.length === 4,
  );
  const pricePercent = tiers[0]?.percent ?? 100;

  // 页面不购买。复制购银单，agent 读到后授权并调用 df__buySilver。
  const copyTier = (tier: number, price: bigint, silver: number) => {
    if (!planet || !paymentToken || !buySilverSpender) return;
    if (planet.silver + silver > planet.silverCap) return;
    const quote = quoteSilverPurchase(level, tier, frontier);
    if (!quote || quote.priceWei !== price) return;
    const text = formatBuySilverOrder({
      chainId: mudClient.chain.id,
      worldAddress,
      planetId: planet.locationId,
      tier,
      priceWhole: quote.priceWhole,
      priceWei: quote.priceWei,
      silverDisplay: quote.silverDisplay,
      paymentToken,
      buySilverSystem: buySilverSpender,
      entryFeeWei: gameManager.getTransactionFee(),
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
    <Container>
      <Text>购银（DFXStar）</Text>
      <Text>
        {frontier > level
          ? `进度 ${frontier} 级，本星 ${level} 级，价格 ${pricePercent}%`
          : `进度 ${frontier} 级，本星按原价`}
      </Text>
      {!configReady ? <Red>链上 DFXStar 配置未完成</Red> : null}
      {!stakingActive ? (
        <Red>暂无全局质押：请先在时空裂隙 withdraw 提银/矿后再购银</Red>
      ) : null}
      {/* 四档直接是按钮。主标题是银，副标题是要付的代币。点下去仍只复制购银单。 */}
      <SilverTiers>
        {tiers.map(({ tier, price, silver, priceLabel }) => {
          const overCap = planet.silver + silver > planet.silverCap;
          const disabled = !stakingActive || !configReady || overCap;
          return (
            <SilverTierButton
              key={tier}
              type="button"
              disabled={disabled}
              title={overCap ? "容量不足" : "复制购买"}
              onClick={() => copyTier(tier, price, silver)}
            >
              <SilverTierAmount>{silver.toLocaleString()} 银</SilverTierAmount>
              <SilverTierCost>
                {priceLabel} {tokenSymbol}
              </SilverTierCost>
            </SilverTierButton>
          );
        })}
      </SilverTiers>
    </Container>
  );
}
