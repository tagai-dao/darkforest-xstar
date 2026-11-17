import { mudFoundry } from "@latticexyz/common/chains";
import { useComponentValue } from "@latticexyz/react";
import { singletonEntity } from "@latticexyz/store-sync/recs";
import { useMUD } from "@mud/MUDContext";
import {
  connectMetaMask,
  sendMetaMaskTransaction,
  walletErrorMessage,
} from "@wallet/addLocalChain";
import { useEffect, useMemo, useState } from "react";
import {
  type Address,
  createWalletClient,
  custom,
  formatUnits,
  isAddress,
  parseAbi,
  parseEther,
  zeroAddress,
} from "viem";

const openMetaMaskWallet = async () => {
  const { account, ethereum } = await connectMetaMask();
  const client = createWalletClient({
    account,
    chain: mudFoundry,
    transport: custom(ethereum),
  });
  return { account, client };
};

const LOCKER_ABI = parseAbi([
  "function owner() view returns (address)",
  "function nft() view returns (address)",
  "function handleRegistry() view returns (address)",
  "function activeWorld() view returns (address)",
  "function activeSeason() view returns (uint8)",
  "function isSeasonOpen() view returns (bool)",
  "function setActiveSeason(address world, uint8 season)",
  "function clearActiveSeason()",
]);

const normalizeAddress = (value: string): Address => {
  const trimmed = value.trim();
  if (!isAddress(trimmed)) {
    throw new Error(`Invalid address: ${value}`);
  }
  return trimmed as Address;
};

export const GamePassAdminPanel = () => {
  const {
    network: { publicClient, waitForTransaction, worldContract },
    components: { GamePassNFT, DFXStarConfig },
  } = useMUD();
  const gamePassConfig = useComponentValue(GamePassNFT, singletonEntity);
  // 买银扣的是这枚 ERC20，地址写在 DFXStarConfig，和上面的 AIPRO NFT 不是同一个合约。
  const starConfig = useComponentValue(DFXStarConfig, singletonEntity);

  const lockerAddress = useMemo(() => {
    const addr = gamePassConfig?.addr as Address | undefined;
    return addr && addr !== zeroAddress ? addr : undefined;
  }, [gamePassConfig?.addr]);

  const aiproToken = useMemo(() => {
    const addr = starConfig?.paymentToken as Address | undefined;
    return addr && addr !== zeroAddress ? addr : undefined;
  }, [starConfig?.paymentToken]);

  const [lockerOwner, setLockerOwner] = useState<Address>();
  const [nftAddress, setNftAddress] = useState<Address>();
  const [handleRegistry, setHandleRegistry] = useState<Address>();
  const [activeWorld, setActiveWorld] = useState<Address>();
  const [activeSeason, setActiveSeason] = useState<number>();
  const [isSeasonOpen, setIsSeasonOpen] = useState(false);
  const [seasonWorldInput, setSeasonWorldInput] = useState("");
  const [seasonNumberInput, setSeasonNumberInput] = useState("1");
  const [nativeRecipient, setNativeRecipient] = useState("");
  const [nativeAmount, setNativeAmount] = useState("1");
  const [status, setStatus] = useState("");

  const configuredWorldAddress = useMemo(() => {
    const address = (worldContract as { address?: Address } | undefined)
      ?.address;
    return address && isAddress(address) ? address : undefined;
  }, [worldContract]);

  useEffect(() => {
    if (configuredWorldAddress && !seasonWorldInput) {
      setSeasonWorldInput(configuredWorldAddress);
    }
  }, [configuredWorldAddress, seasonWorldInput]);

  const loadSeasonState = async (passAddress: Address) => {
    const [world, season, open] = await Promise.all([
      publicClient.readContract({
        address: passAddress,
        abi: LOCKER_ABI,
        functionName: "activeWorld",
      }),
      publicClient.readContract({
        address: passAddress,
        abi: LOCKER_ABI,
        functionName: "activeSeason",
      }),
      publicClient.readContract({
        address: passAddress,
        abi: LOCKER_ABI,
        functionName: "isSeasonOpen",
      }),
    ]);

    setActiveWorld(world === zeroAddress ? undefined : world);
    setActiveSeason(season === 0 ? undefined : Number(season));
    setIsSeasonOpen(open);
  };

  useEffect(() => {
    const loadLocker = async () => {
      if (!lockerAddress) return;
      const [owner, nft, registry] = await Promise.all([
        publicClient.readContract({
          address: lockerAddress,
          abi: LOCKER_ABI,
          functionName: "owner",
        }),
        publicClient.readContract({
          address: lockerAddress,
          abi: LOCKER_ABI,
          functionName: "nft",
        }),
        publicClient.readContract({
          address: lockerAddress,
          abi: LOCKER_ABI,
          functionName: "handleRegistry",
        }),
      ]);
      setLockerOwner(owner);
      setNftAddress(nft);
      setHandleRegistry(registry);
      await loadSeasonState(lockerAddress);
    };

    loadLocker().catch((error) => {
      console.error("Failed to load NFT locker:", error);
      setStatus("读不到质押保管合约。");
    });
  }, [lockerAddress, publicClient]);

  const writeAndWait = async (request: Record<string, unknown>) => {
    const { account, client } = await openMetaMaskWallet();
    if (lockerOwner && account.toLowerCase() !== lockerOwner.toLowerCase()) {
      throw new Error(
        `MetaMask 当前账户是 ${account}，保管合约管理员是 ${lockerOwner}。请切换后再点一次。`,
      );
    }

    const isLocalAnvil = publicClient.chain?.id === 31337;
    const chainAlignedNonce = isLocalAnvil
      ? await publicClient.getTransactionCount({
          address: account,
          blockTag: "pending",
        })
      : undefined;

    setStatus("请在 MetaMask 里确认这笔交易。");
    const tx = await client.writeContract({
      ...(request as {
        address: Address;
        abi: readonly unknown[];
        functionName: string;
        args?: readonly unknown[];
      }),
      ...(chainAlignedNonce !== undefined ? { nonce: chainAlignedNonce } : {}),
    });
    await waitForTransaction(tx);
    return tx;
  };

  const handleAddLocalChain = async () => {
    try {
      setStatus("请在 MetaMask 里连接账户。");
      const { account } = await connectMetaMask();
      setStatus(`已连接 ${account}。链 ID 31337。`);
    } catch (error) {
      console.error(error);
      setStatus(walletErrorMessage(error));
    }
  };

  const handleSetActiveSeason = async () => {
    try {
      if (!lockerAddress) throw new Error("保管合约还没配置。");
      const world = normalizeAddress(seasonWorldInput);
      const season = Number(seasonNumberInput);
      if (!Number.isInteger(season) || season <= 0 || season > 255) {
        throw new Error("轮次要是 1 到 255 的整数。");
      }

      setStatus("正在设置当前轮...");
      await writeAndWait({
        address: lockerAddress,
        abi: LOCKER_ABI,
        functionName: "setActiveSeason",
        args: [world, season],
      });
      await loadSeasonState(lockerAddress);
      setStatus(`当前轮已设为世界 ${world}，轮次 ${season}。`);
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "设置轮次失败。");
    }
  };

  const handleClearActiveSeason = async () => {
    try {
      if (!lockerAddress) throw new Error("保管合约还没配置。");
      setStatus("正在结束当前轮...");
      await writeAndWait({
        address: lockerAddress,
        abi: LOCKER_ABI,
        functionName: "clearActiveSeason",
      });
      await loadSeasonState(lockerAddress);
      setStatus("当前轮已结束。玩家可以取出质押的 NFT。");
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "结束轮次失败。");
    }
  };

  const handleSendNative = async () => {
    try {
      const recipient = normalizeAddress(nativeRecipient);
      const value = parseEther(nativeAmount.trim());
      if (value <= 0n) {
        throw new Error("金额要大于 0。");
      }

      const { account } = await openMetaMaskWallet();
      const balance = await publicClient.getBalance({ address: account });
      if (balance < value) {
        throw new Error(
          `当前账户 ${account} 只有 ${formatUnits(balance, 18)} BNB，不够发送 ${nativeAmount}。`,
        );
      }

      const nonce =
        publicClient.chain?.id === 31337
          ? await publicClient.getTransactionCount({
              address: account,
              blockTag: "pending",
            })
          : undefined;

      setStatus("请在 MetaMask 里确认这笔转账。");
      const tx = await sendMetaMaskTransaction({
        from: account,
        to: recipient,
        value,
        ...(nonce !== undefined ? { nonce } : {}),
      });
      await waitForTransaction(tx);
      setStatus(`已向 ${recipient} 发送 ${nativeAmount} BNB。`);
    } catch (error) {
      console.error(error);
      setStatus(walletErrorMessage(error));
    }
  };

  return (
    <div className="w-full max-w-xl rounded-lg bg-white p-6 text-gray-900 shadow-lg">
      <h2 className="mb-4 text-2xl font-semibold">NFT 质押</h2>

      {status && (
        <div className="mb-4 rounded bg-gray-100 p-3 text-sm text-gray-900">
          {status}
        </div>
      )}

      <button
        type="button"
        onClick={handleAddLocalChain}
        className="mb-6 w-full rounded bg-amber-500 px-4 py-2 text-white hover:bg-amber-600"
      >
        添加本机链到 MetaMask
      </button>

      <div className="mb-6 space-y-1 break-all text-sm">
        <div>保管合约：{lockerAddress ?? "还没配置"}</div>
        <div>管理员：{lockerOwner ?? "-"}</div>
        <div>AIPRO NFT：{nftAddress ?? "-"}</div>
        <div>AIPRO 代币：{aiproToken ?? "-"}</div>
        <div>Handle 注册表：{handleRegistry ?? "-"}</div>
        <div>当前世界：{activeWorld ?? "-"}</div>
        <div>当前轮：{activeSeason ?? "-"}</div>
        <div>轮次开放：{isSeasonOpen ? "是" : "否"}</div>
      </div>

      <div className="mb-8 rounded border border-gray-200 p-4">
        <h3 className="mb-3 text-lg font-medium">当前轮</h3>
        <p className="mb-3 text-sm text-gray-600">
          轮次开着时，已质押的 NFT 不能取出。清空之后，玩家才能取回。
        </p>
        <input
          value={seasonWorldInput}
          onChange={(event) => setSeasonWorldInput(event.target.value)}
          className="mb-2 block w-full rounded border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder:text-gray-500"
          placeholder="World 地址"
        />
        <input
          value={seasonNumberInput}
          onChange={(event) => setSeasonNumberInput(event.target.value)}
          className="mb-3 block w-full rounded border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder:text-gray-500"
          placeholder="轮次，例如 1"
        />
        <button
          type="button"
          onClick={handleSetActiveSeason}
          className="mb-3 w-full rounded bg-emerald-500 px-4 py-2 text-white hover:bg-emerald-600"
        >
          设为当前轮
        </button>
        <button
          type="button"
          onClick={handleClearActiveSeason}
          className="w-full rounded bg-gray-700 px-4 py-2 text-white hover:bg-gray-800"
        >
          结束当前轮
        </button>
      </div>

      <div className="rounded border border-gray-200 p-4">
        <h3 className="mb-3 text-lg font-medium">发送原生币</h3>
        <p className="mb-3 text-sm text-gray-600">
          从 MetaMask 当前账户转出原生币，给指定地址付手续费。
        </p>
        <input
          value={nativeRecipient}
          onChange={(event) => setNativeRecipient(event.target.value)}
          className="mb-2 block w-full rounded border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder:text-gray-500"
          placeholder="接收地址"
        />
        <input
          value={nativeAmount}
          onChange={(event) => setNativeAmount(event.target.value)}
          className="mb-3 block w-full rounded border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder:text-gray-500"
          placeholder="数量，例如 1"
        />
        <button
          type="button"
          onClick={handleSendNative}
          className="w-full rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
        >
          发送
        </button>
      </div>
    </div>
  );
};
