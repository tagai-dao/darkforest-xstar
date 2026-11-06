import { mudFoundry } from "@latticexyz/common/chains";
import type { Address } from "viem";

type Eip1193Provider = {
  request: (args: {
    method: string;
    params?: unknown[] | Record<string, unknown>;
  }) => Promise<unknown>;
  isMetaMask?: boolean;
  isOkxWallet?: boolean;
  isOKExWallet?: boolean;
  isOkexWallet?: boolean;
  _metamask?: unknown;
  providers?: Eip1193Provider[];
};

type AnnouncedWallet = { rdns?: string; provider: Eip1193Provider };

const announcedWallets: AnnouncedWallet[] = [];

// 页面加载时收集各钱包自己的入口。OKX 会占住 window.ethereum，不能靠它判断。
if (typeof window !== "undefined") {
  window.addEventListener("eip6963:announceProvider", (event) => {
    const detail = (
      event as CustomEvent<{
        info?: { rdns?: string };
        provider?: Eip1193Provider;
      }>
    ).detail;
    if (!detail?.provider) return;
    announcedWallets.push({
      rdns: detail.info?.rdns,
      provider: detail.provider,
    });
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

export const localChain = {
  chainId: `0x${mudFoundry.id.toString(16)}`,
  chainName: "Local Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  // MetaMask 只接受 https，或主机名正好是 localhost 的 http。127.0.0.1 会被拒绝。
  rpcUrls: ["http://localhost:8545"],
};

type WalletError = {
  code?: number;
  message?: string;
  data?: { message?: string };
  cause?: unknown;
};

const errorRecord = (error: unknown) => {
  if (!error || typeof error !== "object") return undefined;
  return error as WalletError;
};

// viem 把钱包的 4100 包在 cause 里，页面上的 Error 本身没有 code。
const errorChain = (error: unknown) => {
  const chain: WalletError[] = [];
  let current = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    const record = errorRecord(current);
    if (!record) break;
    chain.push(record);
    current = record.cause;
  }
  return chain;
};

const errorCode = (error: unknown) =>
  errorChain(error).find((item) => item.code !== undefined)?.code;

const errorText = (error: unknown) =>
  errorChain(error)
    .map((item) => item.message || item.data?.message || "")
    .find(Boolean) ?? "";

// 扩展把错误传回页面后会丢掉 Error 原型，不能用 instanceof 判断。
export const walletErrorMessage = (error: unknown): string => {
  if (typeof error === "string" && error) return error;
  const code = errorCode(error);
  const message = errorText(error);
  if (code === 4001 || message.includes("User rejected")) {
    return "已在 MetaMask 里取消。";
  }
  if (code === 4100 || message.includes("has not been authorized")) {
    return "MetaMask 没有授权这个账户转账。请在弹窗里勾选要发送的账户并点连接，然后再发一次。";
  }
  if (message.includes("valid string HTTPS url")) {
    return "当前弹出的是 OKX Wallet。它不允许网页添加 http://localhost。请暂时停用 OKX 扩展，再用 MetaMask 连接；或在 OKX 里手动选中链 ID 31337。";
  }
  if (!message) return "添加本机链失败。";
  return code === undefined ? message : `${message}（${code}）`;
};

const browserWindow = () =>
  window as Window & {
    ethereum?: Eip1193Provider;
    okxwallet?: Eip1193Provider;
  };

const isOkx = (provider?: Eip1193Provider) => {
  if (!provider) return false;
  return Boolean(
    provider.isOkxWallet ||
      provider.isOKExWallet ||
      provider.isOkexWallet ||
      provider === browserWindow().okxwallet,
  );
};

const walletCandidates = () => {
  const injected = browserWindow().ethereum;
  return [...(injected?.providers ?? []), ...(injected ? [injected] : [])];
};

// OKX 会把 isMetaMask 设成 true。扩展 ID mcohilncbfahbmgdjkbpemcciiolgcge 就是它。
export const getMetaMask = (): Eip1193Provider => {
  const metamask =
    announcedWallets.find((item) => item.rdns === "io.metamask")?.provider ??
    walletCandidates().find(
      (provider) =>
        provider.isMetaMask && !isOkx(provider) && provider._metamask,
    ) ??
    walletCandidates().find(
      (provider) => provider.isMetaMask && !isOkx(provider),
    );
  if (!metamask) {
    throw new Error(
      "没有连到 MetaMask。页面现在被 OKX Wallet 占住了，它不允许添加 http://localhost。请暂时停用 OKX 扩展后刷新，再点「连接 MetaMask」。",
    );
  }
  return metamask;
};

const hexQuantity = (value: bigint | number) => `0x${value.toString(16)}`;

// 直接走 eth_sendTransaction。viem 可能改走钱包还没授权的方法，MetaMask 会返回 4100。
export const sendMetaMaskTransaction = async (tx: {
  from: Address;
  to: Address;
  value: bigint;
  nonce?: number;
}) => {
  const ethereum = getMetaMask();
  try {
    await ethereum.request({
      method: "wallet_requestPermissions",
      params: [{ eth_accounts: {} }],
    });
  } catch (error) {
    if (errorCode(error) === 4001) throw error;
  }

  const accounts = (await ethereum.request({
    method: "eth_requestAccounts",
  })) as Address[];
  const selected = accounts[0];
  if (!selected || selected.toLowerCase() !== tx.from.toLowerCase()) {
    throw new Error(
      `MetaMask 当前授权的是 ${selected ?? "空账户"}，要发送的是 ${tx.from}。请在 MetaMask 里切换到这个账户后再点一次。`,
    );
  }

  return ethereum.request({
    method: "eth_sendTransaction",
    params: [
      {
        from: selected,
        to: tx.to,
        value: hexQuantity(tx.value),
        ...(tx.nonce !== undefined ? { nonce: hexQuantity(tx.nonce) } : {}),
      },
    ],
  }) as Promise<`0x${string}`>;
};

// 先请求账户，MetaMask 才会弹出连接窗口。没授权就去切链，页面只会报错。
export const connectMetaMask = async () => {
  const ethereum = getMetaMask();
  const accounts = (await ethereum.request({
    method: "eth_requestAccounts",
  })) as Address[];
  const account = accounts[0];
  if (!account) throw new Error("MetaMask 没有返回账户。");

  const chainId = String(
    await ethereum.request({ method: "eth_chainId" }),
  ).toLowerCase();
  if (chainId === localChain.chainId) return { account, ethereum };

  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: localChain.chainId }],
    });
  } catch (error) {
    // 4902：钱包里还没有 31337。OKX 会拒绝 http 节点，不能由网页添加。
    if (isOkx(ethereum)) {
      throw new Error(
        "OKX Wallet 不允许网页添加 http://localhost。请在 OKX 里手动选中链 ID 31337，或暂时停用 OKX 后用 MetaMask 连接。",
      );
    }
    if (errorCode(error) !== 4902) throw error;
    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [localChain],
    });
  }
  return { account, ethereum };
};
