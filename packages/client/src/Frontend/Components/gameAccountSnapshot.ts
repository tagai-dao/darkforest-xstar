import {
  type Abi,
  type Address,
  formatUnits,
  isAddress,
  isAddressEqual,
  parseAbi,
  type PublicClient,
  zeroAddress,
} from "viem";

const NATIVE_BALANCE_ABI = parseAbi([
  "function getEthBalance(address account) view returns (uint256)",
]);
const TOKEN_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);
const STAKE_ABI = parseAbi([
  "function stakedTokenOf(address player) view returns (uint256)",
  "function stakerOf(uint256 tokenId) view returns (address)",
]);
const REWARD_ABI = parseAbi([
  "function getPendingExternalRewards(address user) view returns (uint256)",
  "function getPendingCommunityRewards(address user) view returns (uint256)",
]);

type Balance = { amount: bigint; decimals: number };

export type GameAccountSnapshot = {
  native: Balance & { symbol: string };
  aipro?: Balance;
  stakedNftId?: bigint | null;
  reward?: {
    pool: Address;
    community?: Address;
    game: bigint;
    communityPending?: bigint;
  };
};

type Read = {
  field: string;
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
};

export async function readGameAccountSnapshot(
  client: PublicClient,
  account: Address,
  targets: {
    aipro?: string;
    locker?: string;
    pool?: string;
    community?: string;
  },
): Promise<GameAccountSnapshot> {
  const chain = client.chain;
  const multicall = chain?.contracts?.multicall3;
  if (!chain || !multicall) throw new Error("Multicall3 is not configured");

  const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
  if (BigInt(multicall.blockCreated ?? 0) > blockNumber) {
    throw new Error("Multicall3 is unavailable at the selected block");
  }

  const aipro = configuredAddress(targets.aipro);
  const locker = configuredAddress(targets.locker);
  const pool = configuredAddress(targets.pool);
  const community = configuredAddress(targets.community);
  const reads: Read[] = [
    {
      field: "native",
      address: multicall.address,
      abi: NATIVE_BALANCE_ABI,
      functionName: "getEthBalance",
      args: [account],
    },
  ];
  if (aipro) {
    reads.push(
      {
        field: "aipro",
        address: aipro,
        abi: TOKEN_ABI,
        functionName: "balanceOf",
        args: [account],
      },
      {
        field: "decimals",
        address: aipro,
        abi: TOKEN_ABI,
        functionName: "decimals",
      },
    );
  }
  if (locker) {
    reads.push(
      {
        field: "stakedNftId",
        address: locker,
        abi: STAKE_ABI,
        functionName: "stakedTokenOf",
        args: [account],
      },
      // A locker entry of zero can represent a real NFT. Check who staked #0.
      {
        field: "zeroStaker",
        address: locker,
        abi: STAKE_ABI,
        functionName: "stakerOf",
        args: [0n],
      },
    );
  }
  if (pool) {
    reads.push({
      field: "gameReward",
      address: pool,
      abi: REWARD_ABI,
      functionName: "getPendingExternalRewards",
      args: [account],
    });
    if (community) {
      reads.push({
        field: "communityReward",
        address: pool,
        abi: REWARD_ABI,
        functionName: "getPendingCommunityRewards",
        args: [account],
      });
    }
  }

  const results = await client.multicall({
    multicallAddress: multicall.address,
    blockNumber,
    allowFailure: false,
    contracts: reads.map(({ address, abi, functionName, args }) => ({
      address,
      abi,
      functionName,
      args,
    })),
  });
  const values = new Map(
    reads.map(({ field }, index) => [field, results[index]]),
  );
  const readUint = (field: string) => {
    const value = values.get(field);
    if (typeof value !== "bigint")
      throw new Error(`Missing game account value: ${field}`);
    return value;
  };

  const snapshot: GameAccountSnapshot = {
    native: {
      amount: readUint("native"),
      decimals: chain.nativeCurrency.decimals,
      symbol: chain.nativeCurrency.symbol,
    },
  };
  if (aipro) {
    const decimals = values.get("decimals");
    if (typeof decimals !== "number") throw new Error("Missing AIPRO decimals");
    snapshot.aipro = { amount: readUint("aipro"), decimals };
  }
  if (locker) {
    const tokenId = readUint("stakedNftId");
    const zeroStaker = values.get("zeroStaker");
    if (typeof zeroStaker !== "string")
      throw new Error("Missing NFT #0 staker");
    snapshot.stakedNftId =
      tokenId === 0n && !isAddressEqual(zeroStaker as Address, account)
        ? null
        : tokenId;
  }
  if (pool) {
    snapshot.reward = {
      pool,
      community,
      game: readUint("gameReward"),
      communityPending: community ? readUint("communityReward") : undefined,
    };
  }
  return snapshot;
}

function configuredAddress(address: string | undefined): Address | undefined {
  if (!address || address.toLowerCase() === zeroAddress) return undefined;
  if (!isAddress(address))
    throw new Error("Invalid game account contract address");
  return address;
}

export function formatNativeBalance({ amount, decimals }: Balance): string {
  const [whole, fraction = ""] = formatUnits(amount, decimals).split(".");
  const shownFraction = fraction.slice(0, 6).replace(/0+$/, "");
  if (amount > 0n && whole === "0" && !shownFraction) return "<0.000001";
  const grouped = BigInt(whole).toLocaleString("zh-CN");
  return shownFraction ? `${grouped}.${shownFraction}` : grouped;
}
