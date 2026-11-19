import { useComponentValue } from "@latticexyz/react";
import { singletonEntity } from "@latticexyz/store-sync/recs";
import { useMUD } from "@mud/MUDContext";
import { useEffect, useState } from "react";
import {
  type Address,
  formatUnits,
  isAddress,
  parseAbi,
  type PublicClient,
  zeroAddress,
} from "viem";

const communityAbi = parseAbi([
  "function activedPools(uint256 index) view returns (address)",
]);

const poolAbi = parseAbi([
  "function getTotalStakedAmount() view returns (uint256)",
  "function getUserStakedAmount(address user) view returns (uint256)",
  "function getPendingExternalRewards(address user) view returns (uint256)",
  "function getPendingCommunityRewards(address user) view returns (uint256)",
]);

const erc20Abi = parseAbi([
  "function symbol() view returns (string)",
  "function balanceOf(address account) view returns (uint256)",
]);

const nftAbi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
]);

const lockerAbi = parseAbi([
  "function nft() view returns (address)",
  "function stakedTokenOf(address player) view returns (uint256)",
]);

export type PoolRow = {
  address: string;
  label: string;
  totalStaked: string;
  userStaked?: string;
};

export type NftRow = {
  label: string;
  symbol?: string;
  balance?: string;
  tokenIds: string[];
};

export type HomeAssets = {
  pools: PoolRow[];
  poolNote: string;
  tokenSymbol: string;
  tokenAddress?: string;
  tokenBalance?: string;
  pendingRewards?: string;
  nfts: NftRow[];
};

const EMPTY: HomeAssets = {
  pools: [],
  poolNote: "正在读取矿池",
  tokenSymbol: "AIPRO",
  nfts: [],
};

function configured(value: string | undefined): Address | undefined {
  if (!value || !isAddress(value) || value.toLowerCase() === zeroAddress) {
    return undefined;
  }
  return value;
}

function grouped(value: bigint): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function tokenAmount(value: bigint): string {
  const [whole, fraction = ""] = formatUnits(value, 18).split(".");
  const head = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const tail = fraction.slice(0, 4).replace(/0+$/, "");
  return tail ? `${head}.${tail}` : head;
}

async function readPools(
  publicClient: PublicClient,
  community: Address,
  scorePool: Address | undefined,
  owner: Address | undefined,
): Promise<{ rows: PoolRow[]; pending?: bigint }> {
  const found: Address[] = [];
  for (let index = 0; index < 8; index += 1) {
    try {
      const pool = await publicClient.readContract({
        address: community,
        abi: communityAbi,
        functionName: "activedPools",
        args: [BigInt(index)],
      });
      if (pool !== zeroAddress) {
        found.push(pool);
      }
    } catch {
      // 下标越界说明后面没有矿池了。
      break;
    }
  }
  if (
    scorePool &&
    !found.some((pool) => pool.toLowerCase() === scorePool.toLowerCase())
  ) {
    found.unshift(scorePool);
  }

  const rows: PoolRow[] = [];
  let pending = 0n;
  for (const pool of found) {
    const row: PoolRow = {
      address: pool,
      label:
        scorePool && pool.toLowerCase() === scorePool.toLowerCase()
          ? "DFXStar 分数池"
          : "矿池",
      totalStaked: "读不到",
    };
    try {
      row.totalStaked = grouped(
        await publicClient.readContract({
          address: pool,
          abi: poolAbi,
          functionName: "getTotalStakedAmount",
        }),
      );
    } catch {
      // 这个池子没有分数接口时，只留地址。
    }
    if (owner) {
      try {
        row.userStaked = grouped(
          await publicClient.readContract({
            address: pool,
            abi: poolAbi,
            functionName: "getUserStakedAmount",
            args: [owner],
          }),
        );
        pending += await publicClient.readContract({
          address: pool,
          abi: poolAbi,
          functionName: "getPendingCommunityRewards",
          args: [owner],
        });
        pending += await publicClient.readContract({
          address: pool,
          abi: poolAbi,
          functionName: "getPendingExternalRewards",
          args: [owner],
        });
      } catch {
        // 个人质押读不到时，总质押仍然保留。
      }
    }
    rows.push(row);
  }
  return { rows, pending: owner ? pending : undefined };
}

/** 首页上的矿池、代币和入场 NFT。钱包地址来自已记住的游戏目录。 */
export function useHomeAssets(wallet: string | undefined): HomeAssets {
  const {
    network: { publicClient },
    components: { DFXStarConfig, GamePassNFT, ArtifactNFT },
  } = useMUD();
  const star = useComponentValue(DFXStarConfig, singletonEntity);
  const pass = useComponentValue(GamePassNFT, singletonEntity);
  const artifact = useComponentValue(ArtifactNFT, singletonEntity);
  const [assets, setAssets] = useState<HomeAssets>(EMPTY);

  useEffect(() => {
    let stopped = false;
    const scorePool = configured(star?.scoreStakingPool);
    const paymentToken = configured(star?.paymentToken);
    const community = configured(star?.community);
    const passAddress = configured(pass?.addr);
    const artifactAddress = configured(artifact?.addr);
    const owner = configured(wallet);

    const load = async () => {
      const next: HomeAssets = {
        pools: [],
        poolNote: community
          ? "链上还没有活跃矿池"
          : "Nutbox 社区还没接到这局里",
        tokenSymbol: "AIPRO",
        tokenAddress: paymentToken,
        nfts: [],
      };

      if (community) {
        try {
          const { rows, pending } = await readPools(
            publicClient,
            community,
            scorePool,
            owner,
          );
          next.pools = rows;
          if (rows.length > 0) {
            next.poolNote = owner
              ? "质押数是分数，奖励是社区代币"
              : "导入游戏数据后显示该钱包的质押";
          }
          if (pending !== undefined) {
            next.pendingRewards = tokenAmount(pending);
          }
        } catch {
          next.poolNote = "矿池暂时读不到";
        }
      }

      if (paymentToken) {
        try {
          next.tokenSymbol = await publicClient.readContract({
            address: paymentToken,
            abi: erc20Abi,
            functionName: "symbol",
          });
          if (owner) {
            next.tokenBalance = tokenAmount(
              await publicClient.readContract({
                address: paymentToken,
                abi: erc20Abi,
                functionName: "balanceOf",
                args: [owner],
              }),
            );
          }
        } catch {
          // 代币读失败时仍显示地址。
        }
      }

      let aiproNft: Address | undefined;
      if (passAddress) {
        try {
          aiproNft = await publicClient.readContract({
            address: passAddress,
            abi: lockerAbi,
            functionName: "nft",
          });
        } catch {
          // 读不到 NFT 合约地址时，NFT 那一栏就不显示。
        }
      }

      const nftTargets = [
        aiproNft ? { address: aiproNft, label: "AIPRO NFT" } : undefined,
        artifactAddress
          ? { address: artifactAddress, label: "神器" }
          : undefined,
      ].filter((row): row is { address: Address; label: string } => !!row);

      for (const target of nftTargets) {
        const row: NftRow = { label: target.label, tokenIds: [] };
        try {
          row.label = await publicClient.readContract({
            address: target.address,
            abi: nftAbi,
            functionName: "name",
          });
          row.symbol = await publicClient.readContract({
            address: target.address,
            abi: nftAbi,
            functionName: "symbol",
          });
          let balance = 0n;
          if (owner) {
            balance = await publicClient.readContract({
              address: target.address,
              abi: nftAbi,
              functionName: "balanceOf",
              args: [owner],
            });
            row.balance = grouped(balance);
          }
          const idCount = Number(balance > 8n ? 8n : balance);
          if (owner && idCount > 0) {
            const ids: string[] = [];
            for (let index = 0; index < idCount; index += 1) {
              const tokenId = await publicClient.readContract({
                address: target.address,
                abi: nftAbi,
                functionName: "tokenOfOwnerByIndex",
                args: [owner, BigInt(index)],
              });
              ids.push(`#${tokenId.toString()}`);
            }
            row.tokenIds = ids;
          }
          if (owner && target.address === aiproNft && passAddress) {
            const staked = await publicClient.readContract({
              address: passAddress,
              abi: lockerAbi,
              functionName: "stakedTokenOf",
              args: [owner],
            });
            if (staked > 0n)
              row.tokenIds.unshift(`质押中 #${staked.toString()}`);
          }
        } catch {
          // 这一份 NFT 读不到时保留标题。
        }
        next.nfts.push(row);
      }

      if (!stopped) {
        setAssets(next);
      }
    };

    load().catch(() => {
      if (!stopped) {
        setAssets({
          ...EMPTY,
          poolNote: "链上暂时读不到",
        });
      }
    });

    return () => {
      stopped = true;
    };
  }, [
    artifact?.addr,
    pass?.addr,
    publicClient,
    star?.community,
    star?.paymentToken,
    star?.scoreStakingPool,
    wallet,
  ]);

  return assets;
}
