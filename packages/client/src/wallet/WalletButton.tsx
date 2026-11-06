import { useMUD } from "@mud/MUDContext";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import React, { useState } from "react";
import { useAccount, useDisconnect } from "wagmi";

import { connectMetaMask, walletErrorMessage } from "./addLocalChain";
import { formatAddress } from "./utils";
import { WalletPane } from "./WalletPane";

export const WalletButton: React.FC = () => {
  const { isConnected, address, chain } = useAccount();
  const { disconnect } = useDisconnect();
  const [showSessionWalletManager, setShowSessionWalletManager] =
    useState(false);
  const [addChainError, setAddChainError] = useState("");
  const [metamaskAccount, setMetamaskAccount] = useState("");

  const {
    network: { walletClient: burnerWalletClient },
  } = useMUD();

  const connectWallet = async () => {
    setAddChainError("");
    try {
      const { account } = await connectMetaMask();
      setMetamaskAccount(account);
      setAddChainError(`已连接 MetaMask：${account}`);
    } catch (error) {
      console.error(error);
      const message = walletErrorMessage(error);
      setAddChainError(message);
      window.alert(message);
    }
  };

  return (
    <div>
      <button
        type="button"
        className="rounded-lg bg-amber-500 px-3 py-2 text-white shadow-md"
        onClick={connectWallet}
      >
        连接 MetaMask
      </button>
      {metamaskAccount && (
        <p className="mt-2 text-sm text-white">{metamaskAccount}</p>
      )}

      {!isConnected && <ConnectButton />}
      {addChainError && (
        <p className="mt-2 max-w-xl text-sm text-red-300">{addChainError}</p>
      )}
      {isConnected && burnerWalletClient.chain.id === chain?.id && (
        <div className="flex items-center space-x-2">
          {/* <span className="rounded-lg bg-gray-800 p-2 text-white shadow-md focus:outline-none">
            {chain?.name}
          </span> */}
          <span className="rounded-lg bg-gray-800 p-2 text-white shadow-md focus:outline-none">
            {formatAddress(address!)}
          </span>
          <button
            className="rounded-lg bg-gray-800 p-2 text-white shadow-md focus:outline-none"
            onClick={() => setShowSessionWalletManager(true)}
          >
            🌸
          </button>
          <button
            className="rounded-lg bg-gray-800 p-2 text-white shadow-md focus:outline-none"
            onClick={() => disconnect()}
          >
            Log Off
          </button>
          {showSessionWalletManager && (
            <WalletPane onClose={() => setShowSessionWalletManager(false)} />
          )}
        </div>
      )}
    </div>
  );
};

export default WalletButton;
