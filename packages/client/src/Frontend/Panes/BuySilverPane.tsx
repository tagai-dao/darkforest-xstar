import { EMPTY_ADDRESS } from "@df/constants";
import { quoteSilverPurchase, SILVER_TIER_PERCENTS } from "@df/silverMarket";
import type { Planet } from "@df/types";
import { PlanetType } from "@df/types";
import { useComponentValue } from "@latticexyz/react";
import { singletonEntity } from "@latticexyz/store-sync/recs";
import { useMUD } from "@mud/MUDContext";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { type Address, parseAbi, zeroAddress } from "viem";
import { usePublicClient, useWalletClient } from "wagmi";

import type { Wrapper } from "../../Backend/Utils/Wrapper";
import { Btn } from "../Components/Btn";
import { Red, Text } from "../Components/Text";
import dfstyles from "../Styles/dfstyles";
import { useAccount, useUIManager } from "../Utils/AppHooks";

const POOL_ABI = parseAbi([
  "function getTotalStakedAmount() external view returns (uint256)",
]);

const ERC20_ABI = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function symbol() view returns (string)",
]);

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

const TierRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-size: ${dfstyles.fontSizeS};
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
  const { data: walletClient } = useWalletClient();
  const {
    components: { DFXStarConfig, SilverFrontier },
  } = useMUD();

  const dfxConfig = useComponentValue(DFXStarConfig, singletonEntity);
  const frontier =
    useComponentValue(SilverFrontier, singletonEntity)?.level ?? 0;

  const [totalStaked, setTotalStaked] = useState<bigint | null>(null);
  const [tokenSymbol, setTokenSymbol] = useState("TOKEN");
  const [tokenBalance, setTokenBalance] = useState<bigint | null>(null);
  const [busyTier, setBusyTier] = useState<number | null>(null);
  const [status, setStatus] = useState("");

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
    if (
      !publicClient ||
      !paymentToken ||
      paymentToken === zeroAddress ||
      !account
    ) {
      setTokenBalance(null);
      return;
    }
    const [balance, symbol] = await Promise.all([
      publicClient.readContract({
        address: paymentToken,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [account as Address],
      }),
      publicClient.readContract({
        address: paymentToken,
        abi: ERC20_ABI,
        functionName: "symbol",
      }),
    ]);
    setTokenBalance(balance);
    setTokenSymbol(symbol);
  }, [publicClient, paymentToken, account]);

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

  const ensureAllowance = async (spender: Address, amount: bigint) => {
    if (!walletClient || !publicClient || !account) {
      throw new Error("请先连接钱包");
    }
    const allowance = await publicClient.readContract({
      address: paymentToken!,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [account as Address, spender],
    });
    if (allowance >= amount) return;

    setStatus(`正在授权 ${tokenSymbol}…`);
    const hash = await walletClient.writeContract({
      chain: publicClient.chain,
      account: account as Address,
      address: paymentToken!,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [spender, amount],
    });
    await publicClient.waitForTransactionReceipt({ hash });
  };

  const buyTier = async (tier: number, price: bigint, silver: number) => {
    if (!planet) return;
    if (!configReady) {
      setStatus("DFXStar 或购银档位尚未配置，请先在 /test 面板写入配置。");
      return;
    }
    if (!stakingActive) {
      setStatus("质押池尚无质押：请先在时空裂隙提银或提矿，再购银。");
      return;
    }
    if (tokenBalance !== null && tokenBalance < price) {
      setStatus(`${tokenSymbol} 余额不足。`);
      return;
    }
    if (planet.silver + silver > planet.silverCap) {
      setStatus("星球银容量不足，无法购买该档位。");
      return;
    }

    try {
      setBusyTier(tier);
      setStatus("");
      await ensureAllowance(buySilverSpender!, price);
      setStatus("正在提交购银交易…");
      await gameManager.buySilver(planet.locationId, tier);
      setStatus("购银交易已提交。");
      await Promise.all([refreshPoolState(), refreshTokenState()]);
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setBusyTier(null);
    }
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
      {tiers.map(({ tier, price, silver, priceLabel }) => {
        const overCap = planet.silver + silver > planet.silverCap;
        const disabled =
          busyTier !== null || !stakingActive || !configReady || overCap;
        return (
          <TierRow key={tier}>
            <span>
              {SILVER_TIER_PERCENTS[tier]}%：{priceLabel} {tokenSymbol} →{" "}
              {silver.toLocaleString()} 银{overCap ? "（容量不足）" : ""}
            </span>
            <Btn
              disabled={disabled}
              onClick={() => buyTier(tier, price, silver)}
            >
              {busyTier === tier ? "…" : "购买"}
            </Btn>
          </TierRow>
        );
      })}
      {status ? <Text>{status}</Text> : null}
    </Container>
  );
}
