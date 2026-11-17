import { useComponentValue } from "@latticexyz/react";
import { singletonEntity } from "@latticexyz/store-sync/recs";
import { useMUD } from "@mud/MUDContext";
import { useEffect, useMemo, useState } from "react";
import {
  type Address,
  formatUnits,
  isAddress,
  parseAbi,
  zeroAddress,
} from "viem";
import { usePublicClient, useWalletClient } from "wagmi";

const DFXSTAR_FACTORY_ABI = parseAbi([
  "function addAdmin(address _admin) external",
  "function isAdmin(address _admin) external view returns (bool)",
]);

const COMMITTEE_ABI = parseAbi([
  "function adminAddFeeFreeAddress(address feeFree) external",
]);

const POOL_ABI = parseAbi([
  "function getTotalStakedAmount() external view returns (uint256)",
  "function getUserStakedAmount(address user) external view returns (uint256)",
  "function getPendingExternalRewards(address user) external view returns (uint256)",
  "function getPendingCommunityRewards(address user) external view returns (uint256)",
  "function claimExternalRewards() external payable",
]);

const COMMUNITY_ABI = parseAbi([
  "function getPoolPendingRewards(address pool, address user) external view returns (uint256)",
  "function withdrawPoolsRewards(address[] pools) external payable",
]);

const ERC20_ABI = parseAbi([
  "function symbol() external view returns (string)",
  "function balanceOf(address account) external view returns (uint256)",
  "function transfer(address to, uint256 amount) external returns (bool)",
]);

function worldAdminLabel(worldIsAdmin: boolean | null): string {
  if (worldIsAdmin === null) return "—";
  if (worldIsAdmin) return "是";
  return "否";
}

const normalizeAddress = (value: string): Address => {
  const trimmed = value.trim();
  if (!isAddress(trimmed)) {
    throw new Error(`Invalid address: ${value}`);
  }
  return trimmed as Address;
};

export const DFXStarIntegrationPanel = () => {
  const {
    network: { worldContract },
    components: { DFXStarConfig },
  } = useMUD();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const onChainConfig = useComponentValue(DFXStarConfig, singletonEntity);

  const [scoreStakingPool, setScoreStakingPool] = useState("");
  const [paymentToken, setPaymentToken] = useState("");
  const [stakingFactory, setStakingFactory] = useState("");
  const [community, setCommunity] = useState("");
  const [buySilverSystem, setBuySilverSystem] = useState("");
  const [worldAddress, setWorldAddress] = useState("");
  const [totalStaked, setTotalStaked] = useState<bigint | null>(null);
  const [worldIsAdmin, setWorldIsAdmin] = useState<boolean | null>(null);
  const [status, setStatus] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("");
  const [tokenBalance, setTokenBalance] = useState<bigint | null>(null);

  // User staking state
  const [userStaked, setUserStaked] = useState<bigint | null>(null);
  const [pendingExternal, setPendingExternal] = useState<bigint | null>(null);
  const [pendingCommunity, setPendingCommunity] = useState<bigint | null>(null);

  // Transfer DFS state
  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState("");

  const configuredWorld = useMemo(() => {
    const world = worldContract as
      | { address?: Address; abi?: readonly unknown[] }
      | undefined;
    return world;
  }, [worldContract]);

  useEffect(() => {
    if (!onChainConfig) return;
    setScoreStakingPool(onChainConfig.scoreStakingPool ?? "");
    setPaymentToken(onChainConfig.paymentToken ?? "");
    setStakingFactory(onChainConfig.stakingFactory ?? "");
    setCommunity(onChainConfig.community ?? "");
    setBuySilverSystem(onChainConfig.buySilverSystem ?? "");
  }, [onChainConfig]);

  useEffect(() => {
    setWorldAddress(configuredWorld?.address ?? "");
  }, [configuredWorld?.address]);

  const refreshReads = async () => {
    if (!publicClient) return;
    try {
      const pool = scoreStakingPool
        ? normalizeAddress(scoreStakingPool)
        : zeroAddress;
      const factory = stakingFactory
        ? normalizeAddress(stakingFactory)
        : zeroAddress;
      const world = worldAddress ? normalizeAddress(worldAddress) : zeroAddress;
      const token = paymentToken ? normalizeAddress(paymentToken) : zeroAddress;

      // Pool global state
      if (pool !== zeroAddress) {
        const staked = await publicClient.readContract({
          address: pool,
          abi: POOL_ABI,
          functionName: "getTotalStakedAmount",
        });
        setTotalStaked(staked);
      } else {
        setTotalStaked(null);
      }

      // Factory admin check
      if (factory !== zeroAddress && world !== zeroAddress) {
        const isAdmin = await publicClient.readContract({
          address: factory,
          abi: DFXSTAR_FACTORY_ABI,
          functionName: "isAdmin",
          args: [world],
        });
        setWorldIsAdmin(isAdmin);
      } else {
        setWorldIsAdmin(null);
      }

      // Token info
      if (token !== zeroAddress) {
        const [symbol, balance] = await Promise.all([
          publicClient.readContract({
            address: token,
            abi: ERC20_ABI,
            functionName: "symbol",
          }),
          walletClient?.account
            ? publicClient.readContract({
                address: token,
                abi: ERC20_ABI,
                functionName: "balanceOf",
                args: [walletClient.account.address],
              })
            : Promise.resolve(null),
        ]);
        setTokenSymbol(symbol);
        setTokenBalance(balance);
      }

      // User staking state
      if (pool !== zeroAddress && walletClient?.account) {
        const userAddr = walletClient.account.address;
        const [staked, extRewards, communityRewards] = await Promise.all([
          publicClient.readContract({
            address: pool,
            abi: POOL_ABI,
            functionName: "getUserStakedAmount",
            args: [userAddr],
          }),
          publicClient.readContract({
            address: pool,
            abi: POOL_ABI,
            functionName: "getPendingExternalRewards",
            args: [userAddr],
          }),
          publicClient.readContract({
            address: pool,
            abi: POOL_ABI,
            functionName: "getPendingCommunityRewards",
            args: [userAddr],
          }),
        ]);
        setUserStaked(staked);
        setPendingExternal(extRewards);
        setPendingCommunity(communityRewards);
      } else {
        setUserStaked(null);
        setPendingExternal(null);
        setPendingCommunity(null);
      }

      setStatus("Read state refreshed.");
    } catch (error) {
      setStatus(`Read failed: ${(error as Error).message}`);
    }
  };

  useEffect(() => {
    refreshReads().catch(() => undefined);
  }, [
    scoreStakingPool,
    stakingFactory,
    worldAddress,
    paymentToken,
    publicClient,
  ]);

  const writeDFXStarConfig = async () => {
    if (!walletClient || !configuredWorld?.address || !configuredWorld.abi) {
      setStatus("Connect wallet and ensure World is loaded.");
      return;
    }
    try {
      const hash = await walletClient.writeContract({
        address: configuredWorld.address,
        abi: configuredWorld.abi,
        functionName: "df__setDFXStarConfig",
        args: [
          normalizeAddress(scoreStakingPool),
          normalizeAddress(paymentToken),
          normalizeAddress(stakingFactory),
          normalizeAddress(community),
          normalizeAddress(buySilverSystem),
        ],
      });
      setStatus(`DFXStarConfig tx: ${hash}`);
    } catch (error) {
      setStatus(`setDFXStarConfig failed: ${(error as Error).message}`);
    }
  };

  const addWorldAsAdmin = async () => {
    if (!walletClient || !stakingFactory || !worldAddress) return;
    try {
      const hash = await walletClient.writeContract({
        address: normalizeAddress(stakingFactory),
        abi: DFXSTAR_FACTORY_ABI,
        functionName: "addAdmin",
        args: [normalizeAddress(worldAddress)],
      });
      setStatus(`addAdmin tx: ${hash}`);
      await refreshReads();
    } catch (error) {
      setStatus(`addAdmin failed: ${(error as Error).message}`);
    }
  };

  const setFeeFree = async () => {
    if (!walletClient || !worldAddress) return;
    const committee = prompt("Committee contract address:");
    if (!committee) return;
    try {
      const hash = await walletClient.writeContract({
        address: normalizeAddress(committee),
        abi: COMMITTEE_ABI,
        functionName: "adminAddFeeFreeAddress",
        args: [normalizeAddress(worldAddress)],
      });
      setStatus(`feeFree tx: ${hash}`);
    } catch (error) {
      setStatus(`feeFree failed: ${(error as Error).message}`);
    }
  };

  const stakedLabel = useMemo(() => {
    if (totalStaked === null) return "—";
    return totalStaked.toString();
  }, [totalStaked]);

  const claimExternalRewards = async () => {
    if (!walletClient || !scoreStakingPool) return;
    try {
      const hash = await walletClient.writeContract({
        address: normalizeAddress(scoreStakingPool),
        abi: POOL_ABI,
        functionName: "claimExternalRewards",
        value: 0n,
      });
      setStatus(`claimExternalRewards tx: ${hash}`);
      await refreshReads();
    } catch (error) {
      setStatus(`claimExternalRewards failed: ${(error as Error).message}`);
    }
  };

  const claimCommunityRewards = async () => {
    if (!walletClient || !community || !scoreStakingPool) return;
    try {
      const hash = await walletClient.writeContract({
        address: normalizeAddress(community),
        abi: COMMUNITY_ABI,
        functionName: "withdrawPoolsRewards",
        args: [[normalizeAddress(scoreStakingPool)]],
        value: 0n,
      });
      setStatus(`withdrawPoolsRewards tx: ${hash}`);
      await refreshReads();
    } catch (error) {
      setStatus(`withdrawPoolsRewards failed: ${(error as Error).message}`);
    }
  };

  const transferDFS = async () => {
    if (!walletClient || !paymentToken || !transferTo || !transferAmount)
      return;
    try {
      const amount = BigInt(transferAmount) * 10n ** 18n;
      const hash = await walletClient.writeContract({
        address: normalizeAddress(paymentToken),
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [normalizeAddress(transferTo), amount],
      });
      setStatus(`transfer DFS tx: ${hash}`);
      await refreshReads();
    } catch (error) {
      setStatus(`transfer failed: ${(error as Error).message}`);
    }
  };

  return (
    <div className="mb-6 rounded border border-amber-700/50 bg-amber-950/20 p-4 text-sm">
      <h2 className="mb-2 text-lg font-semibold text-amber-200">
        DFXStar 联调（TagAI Nutbox）
      </h2>
      <p className="mb-3 text-amber-100/80">
        流程：PostDeploy 自动 bootstrap Nutbox → 本面板查看质押/奖励 → 用 DFS
        购银/领取。
      </p>

      <div className="mb-3 grid gap-2 md:grid-cols-2">
        <label className="flex flex-col gap-1">
          World
          <input
            className="rounded border border-gray-600 bg-black/40 px-2 py-1 font-mono text-xs"
            value={worldAddress}
            onChange={(e) => setWorldAddress(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          DFXStarScoreStaking Pool
          <input
            className="rounded border border-gray-600 bg-black/40 px-2 py-1 font-mono text-xs"
            value={scoreStakingPool}
            onChange={(e) => setScoreStakingPool(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          AIPRO 代币 {tokenSymbol ? `(${tokenSymbol})` : ""}
          <input
            className="rounded border border-gray-600 bg-black/40 px-2 py-1 font-mono text-xs"
            value={paymentToken}
            onChange={(e) => setPaymentToken(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          DFXStarScoreStakingFactory
          <input
            className="rounded border border-gray-600 bg-black/40 px-2 py-1 font-mono text-xs"
            value={stakingFactory}
            onChange={(e) => setStakingFactory(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          Community
          <input
            className="rounded border border-gray-600 bg-black/40 px-2 py-1 font-mono text-xs"
            value={community}
            onChange={(e) => setCommunity(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          BuySilverSystem（ERC20 approve 目标）
          <input
            className="rounded border border-gray-600 bg-black/40 px-2 py-1 font-mono text-xs"
            value={buySilverSystem}
            onChange={(e) => setBuySilverSystem(e.target.value)}
          />
        </label>
      </div>

      <div className="mb-3 space-y-1 text-xs text-amber-100/90">
        <div>池子 totalStaked: {stakedLabel}</div>
        <div>World 是否为 Factory admin: {worldAdminLabel(worldIsAdmin)}</div>
        <div>
          你的 DFS 余额:{" "}
          {tokenBalance !== null ? formatUnits(tokenBalance, 18) : "—"}{" "}
          {tokenSymbol}
        </div>
      </div>

      {/* ─── 用户质押数据 ─── */}
      <div className="mb-3 rounded border border-amber-800/40 bg-amber-950/30 p-3">
        <h3 className="mb-2 text-sm font-medium text-amber-200">我的质押</h3>
        <div className="space-y-1 text-xs text-amber-100/90">
          <div>
            已质押 score:{" "}
            {userStaked !== null ? userStaked.toLocaleString() : "—"}
          </div>
          <div>
            待领取外部奖励 (B线):{" "}
            {pendingExternal !== null ? (
              <span className={pendingExternal > 0n ? "text-green-400" : ""}>
                {formatUnits(pendingExternal, 18)} {tokenSymbol}
              </span>
            ) : (
              "—"
            )}
          </div>
          <div>
            待领取社区奖励 (A线):{" "}
            {pendingCommunity !== null ? (
              <span className={pendingCommunity > 0n ? "text-green-400" : ""}>
                {formatUnits(pendingCommunity, 18)} {tokenSymbol}
              </span>
            ) : (
              "—"
            )}
          </div>
        </div>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className="rounded bg-emerald-700 px-3 py-1 text-xs text-white hover:bg-emerald-600 disabled:opacity-40"
            disabled={!pendingExternal || pendingExternal === 0n}
            onClick={() => claimExternalRewards()}
          >
            领取 B 线奖励
          </button>
          <button
            type="button"
            className="rounded bg-teal-700 px-3 py-1 text-xs text-white hover:bg-teal-600 disabled:opacity-40"
            disabled={!pendingCommunity || pendingCommunity === 0n}
            onClick={() => claimCommunityRewards()}
          >
            领取 A 线奖励
          </button>
          <button
            type="button"
            className="rounded bg-amber-700 px-2 py-1 text-xs text-white hover:bg-amber-600"
            onClick={() => refreshReads()}
          >
            刷新
          </button>
        </div>
      </div>

      {/* ─── DFS 转账（deployer 给测试账号分代币） ─── */}
      <div className="mb-3 rounded border border-amber-800/40 bg-amber-950/30 p-3">
        <h3 className="mb-2 text-sm font-medium text-amber-200">DFS 转账</h3>
        <div className="flex gap-2">
          <input
            className="w-40 rounded border border-gray-600 bg-black/40 px-2 py-1 font-mono text-xs"
            placeholder="目标地址"
            value={transferTo}
            onChange={(e) => setTransferTo(e.target.value)}
          />
          <input
            className="w-24 rounded border border-gray-600 bg-black/40 px-2 py-1 font-mono text-xs"
            placeholder="数量"
            value={transferAmount}
            onChange={(e) => setTransferAmount(e.target.value)}
          />
          <button
            type="button"
            className="rounded bg-amber-700 px-3 py-1 text-xs text-white hover:bg-amber-600"
            onClick={() => transferDFS()}
          >
            转账
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded bg-amber-700 px-3 py-1 text-white hover:bg-amber-600"
          onClick={() => refreshReads()}
        >
          刷新只读状态
        </button>
        <button
          type="button"
          className="rounded bg-blue-700 px-3 py-1 text-white hover:bg-blue-600"
          onClick={() => writeDFXStarConfig()}
        >
          写入链上 DFXStarConfig
        </button>
        <button
          type="button"
          className="rounded bg-green-700 px-3 py-1 text-white hover:bg-green-600"
          onClick={() => addWorldAsAdmin()}
        >
          Factory.addAdmin(World)
        </button>
        <button
          type="button"
          className="rounded bg-gray-700 px-3 py-1 text-white hover:bg-gray-600"
          onClick={() => setFeeFree()}
        >
          Committee.feeFree(World)
        </button>
      </div>

      {status ? <p className="mt-3 text-xs text-amber-200">{status}</p> : null}

      <ol className="mt-4 list-decimal space-y-1 pl-5 text-xs text-amber-100/80">
        <li>先在时空裂隙提银/矿，使 totalStaked &gt; 0</li>
        <li>再在游戏内星球面板购银（需 approve BuySilverSystem）</li>
        <li>购银支付币须与 Nutbox 社区代币为同一地址</li>
      </ol>
    </div>
  );
};
