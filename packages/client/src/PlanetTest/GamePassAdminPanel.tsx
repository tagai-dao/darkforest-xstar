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

// 保管合约没有管理员。谁能给钱包登记 handle，看的是登记处的 owner。
const LOCKER_ABI = parseAbi([
  "function nft() view returns (address)",
  "function handleRegistry() view returns (address)",
]);

const REGISTRY_ABI = parseAbi(["function owner() view returns (address)"]);

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

  const [registryOwner, setRegistryOwner] = useState<Address>();
  const [nftAddress, setNftAddress] = useState<Address>();
  const [handleRegistry, setHandleRegistry] = useState<Address>();
  const [nativeRecipient, setNativeRecipient] = useState("");
  const [nativeAmount, setNativeAmount] = useState("1");
  const [status, setStatus] = useState("");

  const configuredWorldAddress = useMemo(() => {
    const address = (worldContract as { address?: Address } | undefined)
      ?.address;
    return address && isAddress(address) ? address : undefined;
  }, [worldContract]);

  useEffect(() => {
    const loadLocker = async () => {
      if (!lockerAddress) return;
      // 每项单独读。某一项读不到，不影响其余几项显示。
      const [nft, registry] = await Promise.all([
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
      setNftAddress(nft);
      setHandleRegistry(registry);

      try {
        setRegistryOwner(
          await publicClient.readContract({
            address: registry,
            abi: REGISTRY_ABI,
            functionName: "owner",
          }),
        );
      } catch {
        // 主网登记处没有 owner 函数。
        setRegistryOwner(undefined);
      }
    };

    loadLocker().catch((error) => {
      console.error("Failed to load NFT locker:", error);
      setStatus("读不到质押保管合约。");
    });
  }, [lockerAddress, publicClient]);

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
        <div>管理员（能登记 handle）：{registryOwner ?? "-"}</div>
        <div>AIPRO NFT：{nftAddress ?? "-"}</div>
        <div>AIPRO 代币：{aiproToken ?? "-"}</div>
        <div>Handle 注册表：{handleRegistry ?? "-"}</div>
        <div>当前世界：{configuredWorldAddress ?? "-"}</div>
      </div>

      <p className="mb-8 text-sm text-gray-600">
        NFT 可以随时质押和取出。取出之后，这只钱包不能进行会改状态的游戏操作。
      </p>

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
