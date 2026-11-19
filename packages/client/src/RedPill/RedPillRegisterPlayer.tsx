import type { EthConnection } from "@df/network";
import { addressToHex } from "@df/serde";
import type { EthAddress } from "@df/types";
import { Green, Red } from "@frontend/Components/Text";
import { transactionQueue, writeObserver } from "@latticexyz/common/actions";
import { observer } from "@latticexyz/explorer/observer";
import { getComponentValue } from "@latticexyz/recs";
import { encodeEntity, singletonEntity } from "@latticexyz/store-sync/recs";
import { useMUD } from "@mud/MUDContext";
import React, { useCallback, useEffect, useState } from "react";
import styled from "styled-components";
import {
  type Address,
  createWalletClient,
  encodeFunctionData,
  http,
  parseAbi,
  type WalletClient,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const LOCKER_ABI = parseAbi([
  "function nft() view returns (address)",
  "function handleRegistry() view returns (address)",
  "function isPlayerInActiveSeason(address player) view returns (bool)",
  "function stakedTokenOf(address player) view returns (uint256)",
  "function stake(uint256 tokenId)",
  "function withdraw(uint256 tokenId)",
]);

const NFT_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function getApproved(uint256 tokenId) view returns (address)",
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
  "function approve(address to, uint256 tokenId)",
]);

const HANDLE_ABI = parseAbi([
  "function handleOf(address owner) view returns (string)",
]);

type GamePassRequirement = {
  isEnabled: boolean;
  isLoading: boolean;
  isJoined: boolean;
  hasNft: boolean;
  hasHandle: boolean;
  stakedTokenId?: bigint;
  error?: string;
};

const StyledInput = styled.input`
  background-color: transparent;
  color: white;
  border: 2px solid #ff69b4;
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 18px;
  transition: all 0.3s ease;
  box-shadow: ${(props) =>
    !props.value ? "0 0 30px #ff1493" : "0 0 5px rgba(255, 105, 180, 0.2)"};
  outline: none;
  width: 400px;
  height: 50px;

  &:focus {
    border-color: #ff1493;
    box-shadow: 0 0 15px rgba(255, 105, 180, 0.5);
  }

  &::placeholder {
    color: rgba(255, 255, 255, 0.5);
  }

  animation: ${(props) =>
    !props.value ? "glow 1.5s ease-in-out infinite alternate" : "none"};

  @keyframes glow {
    from {
      box-shadow:
        0 0 30px #ff1493,
        0 0 50px rgba(255, 20, 147, 0.8),
        0 0 70px rgba(255, 20, 147, 0.6);
      border-color: #ff1493;
    }
    to {
      box-shadow:
        0 0 5px rgba(255, 105, 180, 0.2),
        0 0 10px rgba(255, 105, 180, 0.1);
      border-color: #ff69b4;
    }
  }
`;

const PlayerNameLabel = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  margin-top: 20px;
  width: 100%;
`;

const PlayerNameValue = styled.div`
  color: #ff69b4;
  font-weight: bold;
  font-size: 48px;
  text-shadow: 0 0 20px rgba(255, 105, 180, 0.5);
  transition: all 0.3s ease;
  padding: 16px;
  letter-spacing: 2px;

  &:hover {
    text-shadow: 0 0 30px rgba(255, 105, 180, 0.8);
    transform: scale(1.05);
  }
`;

const NotSetText = styled.span`
  font-size: 24px;
  color: rgba(255, 255, 255, 0.5);
  font-style: italic;

  font-weight: bold;
  font-size: 48px;
  transition: all 0.3s ease;
  padding: 16px;
  letter-spacing: 2px;
`;

const PinkButton = styled.button`
  background-color: #ff69b4;
  color: white;
  border: none;
  border-radius: 25px;
  padding: 20px 40px;
  font-size: 24px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 15px rgba(255, 105, 180, 0.3);
  margin: 20px;
  min-width: 200px;
  outline: none;

  &:hover {
    background-color: #ff1493;
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(255, 105, 180, 0.4);
  }

  &:active {
    transform: translateY(1px);
    box-shadow: 0 2px 10px rgba(255, 105, 180, 0.3);
  }

  &:focus {
    outline: none;
  }

  &:disabled {
    background-color: #ffc0cb;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
    opacity: 0.6;

    &:hover {
      background-color: #ffc0cb;
      transform: none;
      box-shadow: none;
    }
  }
`;

export const RedPillRegisterPlayer = ({
  ethConnection,
}: {
  ethConnection: EthConnection;
}) => {
  const {
    network: { playerEntity, worldContract, waitForTransaction, publicClient },
    components: { Player, GamePassNFT },
  } = useMUD();

  const [state, setState] = useState({
    playerName: "",
    isPlayerRegistered: false,
    registrationStatus: "",
  });

  const [registrationMessage, setRegistrationMessage] = useState("");
  const [redPillWalletClient, setRedPillWalletClient] =
    useState<WalletClient | null>(null);
  const [gamePassRequirement, setGamePassRequirement] =
    useState<GamePassRequirement>({
      isEnabled: false,
      isLoading: false,
      isJoined: false,
      hasNft: false,
      hasHandle: false,
    });

  // Convert EthAddress to 0x hex string
  const toHexAddress = (
    address: EthAddress | undefined,
  ): `0x${string}` | undefined => {
    if (!address) return undefined;
    return address as `0x${string}`;
  };

  // Create a viem WalletClient from ethConnection
  useEffect(() => {
    if (ethConnection) {
      const address = ethConnection.getAddress();
      const privateKey = ethConnection.getPrivateKey();
      const provider = ethConnection.getProvider();

      if (address && privateKey) {
        try {
          const account = privateKeyToAccount(privateKey as `0x${string}`);

          // Create a custom wallet client using ethConnection's data
          const customWalletClient = createWalletClient({
            account,
            transport: http(provider.connection.url),
            chain: publicClient.chain,
          })
            .extend(transactionQueue())
            .extend(
              writeObserver({
                onWrite: (write) => console.log("Transaction write:", write),
              }),
            )
            .extend(observer({ waitForTransaction }) as never);

          setRedPillWalletClient(customWalletClient);
        } catch (error) {
          console.error("Failed to create wallet client:", error);
        }
      }
    }
  }, [ethConnection, waitForTransaction, publicClient]);

  useEffect(() => {
    const checkPlayerRegistration = () => {
      if (playerEntity && ethConnection) {
        const address = ethConnection.getAddress();
        if (address) {
          const playerKey = encodeEntity(Player.metadata.keySchema, {
            owner: addressToHex(address),
          });
          const rawPlayer = getComponentValue(Player, playerKey);
          setState((prev) => ({
            ...prev,
            isPlayerRegistered: !!rawPlayer,
            playerName:
              rawPlayer?.name ||
              (prev.isPlayerRegistered ? "" : prev.playerName),
          }));
        }
      }
    };

    // Initial check
    checkPlayerRegistration();

    // Set up interval to check every 5 seconds
    const intervalId = setInterval(checkPlayerRegistration, 5000);

    // Clean up interval on component unmount
    return () => clearInterval(intervalId);
  }, [playerEntity, Player, ethConnection]);

  const handlePlayerNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setState((prev) => ({
        ...prev,
        playerName: e.target.value.replace(/\s+/g, "").slice(0, 16),
      }));
    },
    [],
  );

  const getConfiguredGamePassAddress = () => {
    const gamePass = getComponentValue(GamePassNFT, singletonEntity);
    const passAddress = gamePass?.addr as Address | undefined;
    return passAddress && passAddress !== zeroAddress ? passAddress : undefined;
  };

  const writeAndWait = async (
    walletClient: WalletClient,
    request: Record<string, unknown>,
  ) => {
    const writeClient = walletClient as WalletClient & {
      writeContract: (
        request: Record<string, unknown>,
      ) => Promise<`0x${string}`>;
    };

    const account = walletClient.account;
    const isLocalAnvil = publicClient.chain?.id === 31337;
    const chainAlignedNonce = isLocalAnvil
      ? await publicClient.getTransactionCount({
          address: account.address,
          blockTag: "pending",
        })
      : undefined;

    const tx = await writeClient.writeContract({
      chain: publicClient.chain,
      account,
      ...request,
      ...(chainAlignedNonce !== undefined ? { nonce: chainAlignedNonce } : {}),
    });
    await waitForTransaction(tx);
    return tx;
  };

  const findOwnedNft = async (nftAddress: Address, playerAddress: Address) => {
    const balance = await publicClient.readContract({
      address: nftAddress,
      abi: NFT_ABI,
      functionName: "balanceOf",
      args: [playerAddress],
    });
    if (balance === 0n) return undefined;
    return publicClient.readContract({
      address: nftAddress,
      abi: NFT_ABI,
      functionName: "tokenOfOwnerByIndex",
      args: [playerAddress, 0n],
    });
  };

  const refreshGamePassRequirement = useCallback(async () => {
    const playerAddress = toHexAddress(ethConnection.getAddress());
    const passAddress = getConfiguredGamePassAddress();
    if (!playerAddress || !passAddress) {
      setGamePassRequirement({
        isEnabled: !!passAddress,
        isLoading: false,
        isJoined: false,
        hasNft: false,
        hasHandle: false,
      });
      return;
    }

    setGamePassRequirement((prev) => ({
      ...prev,
      isEnabled: true,
      isLoading: true,
      error: undefined,
    }));

    try {
      const [isJoined, nft, registry, stakedTokenId] = await Promise.all([
        publicClient.readContract({
          address: passAddress,
          abi: LOCKER_ABI,
          functionName: "isPlayerInActiveSeason",
          args: [playerAddress],
        }),
        publicClient.readContract({
          address: passAddress,
          abi: LOCKER_ABI,
          functionName: "nft",
        }),
        publicClient.readContract({
          address: passAddress,
          abi: LOCKER_ABI,
          functionName: "handleRegistry",
        }),
        publicClient.readContract({
          address: passAddress,
          abi: LOCKER_ABI,
          functionName: "stakedTokenOf",
          args: [playerAddress],
        }),
      ]);

      const [handle, ownedTokenId] = await Promise.all([
        publicClient.readContract({
          address: registry,
          abi: HANDLE_ABI,
          functionName: "handleOf",
          args: [playerAddress],
        }),
        findOwnedNft(nft, playerAddress),
      ]);

      setGamePassRequirement({
        isEnabled: true,
        isLoading: false,
        isJoined,
        hasNft: ownedTokenId !== undefined,
        hasHandle: handle.length > 0,
        stakedTokenId,
      });
    } catch (error) {
      console.error("Failed to load Game Pass requirement:", error);
      setGamePassRequirement({
        isEnabled: true,
        isLoading: false,
        isJoined: false,
        hasNft: false,
        hasHandle: false,
        error: "读不到质押状态。请刷新后再试。",
      });
    }
  }, [ethConnection, GamePassNFT, publicClient]);

  useEffect(() => {
    refreshGamePassRequirement();
    const intervalId = setInterval(refreshGamePassRequirement, 5000);
    return () => clearInterval(intervalId);
  }, [refreshGamePassRequirement]);

  const ensureGamePassReady = async (
    passAddress: Address,
    playerAddress: Address,
    walletClient: WalletClient,
  ) => {
    const [alreadyJoined, nft, registry] = await Promise.all([
      publicClient.readContract({
        address: passAddress,
        abi: LOCKER_ABI,
        functionName: "isPlayerInActiveSeason",
        args: [playerAddress],
      }),
      publicClient.readContract({
        address: passAddress,
        abi: LOCKER_ABI,
        functionName: "nft",
      }),
      publicClient.readContract({
        address: passAddress,
        abi: LOCKER_ABI,
        functionName: "handleRegistry",
      }),
    ]);

    if (alreadyJoined) return;

    const handle = await publicClient.readContract({
      address: registry,
      abi: HANDLE_ABI,
      functionName: "handleOf",
      args: [playerAddress],
    });
    if (handle.length === 0) {
      throw new Error("这只钱包没有 Binance handle，不能质押。");
    }

    const tokenId = await findOwnedNft(nft, playerAddress);
    if (tokenId === undefined) {
      throw new Error(
        "这只钱包还没有 AIPRO NFT。先取得一枚，再质押进这局游戏。",
      );
    }

    const [approved, approvedForAll] = await Promise.all([
      publicClient.readContract({
        address: nft,
        abi: NFT_ABI,
        functionName: "getApproved",
        args: [tokenId],
      }),
      publicClient.readContract({
        address: nft,
        abi: NFT_ABI,
        functionName: "isApprovedForAll",
        args: [playerAddress, passAddress],
      }),
    ]);
    if (approved !== passAddress && !approvedForAll) {
      setRegistrationMessage("授权保管合约接收这枚 NFT...");
      await writeAndWait(walletClient, {
        address: nft,
        abi: NFT_ABI,
        functionName: "approve",
        args: [passAddress, tokenId],
      });
    }

    setRegistrationMessage("把 AIPRO NFT 质押进这局游戏...");
    await writeAndWait(walletClient, {
      address: passAddress,
      abi: LOCKER_ABI,
      functionName: "stake",
      args: [tokenId],
    });
  };

  const getRegistrationErrorMessage = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("没有 Binance handle") ||
      message.includes("还没有 AIPRO NFT")
    ) {
      return message;
    }
    return "注册失败。确认这只钱包有 Binance handle，并且持有一枚 AIPRO NFT。";
  };

  const registerPlayerAction = async () => {
    if (!redPillWalletClient) {
      alert("No wallet client available");
      console.error("No wallet client available");
      return;
    }

    const address = ethConnection.getAddress();
    if (!address) {
      alert("No address available");
      console.error("No address available");
      return;
    }

    if (state.playerName.length === 0) {
      alert("Player name is required");
      console.error("Player name is required");
      return;
    }

    try {
      const registerPlayerAbi = [
        {
          inputs: [
            { internalType: "string", name: "name", type: "string" },
            { internalType: "address", name: "burner", type: "address" },
          ],
          name: "df__registerPlayer",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function",
        },
      ];

      const hexAddress = toHexAddress(address);
      if (!hexAddress) {
        alert("Invalid address format");
        return;
      }

      const gamePassAddress = getConfiguredGamePassAddress();
      if (gamePassAddress) {
        await ensureGamePassReady(
          gamePassAddress,
          hexAddress,
          redPillWalletClient,
        );
      }

      const data = encodeFunctionData({
        abi: registerPlayerAbi,
        functionName: "df__registerPlayer",
        args: [state.playerName, hexAddress],
      });

      const txData = {
        account: redPillWalletClient.account,
        chain: publicClient.chain,
        to: (worldContract as { address: Address }).address,
        data,
        gas: 500000n,
      };

      console.log("Preparing to send transaction:", txData);
      console.log("Using wallet client:", redPillWalletClient);

      // Use the viem wallet client created from ethConnection
      const sendClient = redPillWalletClient as WalletClient & {
        sendTransaction: (
          request: Record<string, unknown>,
        ) => Promise<`0x${string}`>;
      };
      const txResponse = await sendClient.sendTransaction(txData);
      console.log("Transaction sent:", txResponse);
      await waitForTransaction(txResponse);

      setRegistrationMessage("Player registered successfully!");

      // Set a timer to clear the message after 5 seconds
      setTimeout(() => {
        setRegistrationMessage("");
      }, 5000);
    } catch (error) {
      console.error("Transaction failed:", error);
      setRegistrationMessage(getRegistrationErrorMessage(error));

      // Also clear error message after 5 seconds
      setTimeout(() => {
        setRegistrationMessage("");
      }, 5000);
    }
  };

  const renderGamePassRequirement = () => {
    if (!gamePassRequirement.isEnabled) {
      return null;
    }

    let accessStatus: React.ReactNode;
    if (gamePassRequirement.isLoading) {
      accessStatus = "正在检查...";
    } else if (gamePassRequirement.isJoined) {
      accessStatus = (
        <Green>
          已质押 #{gamePassRequirement.stakedTokenId?.toString() ?? "-"}
          ，可以进入这局游戏
        </Green>
      );
    } else if (!gamePassRequirement.hasHandle) {
      accessStatus = <Red>这只钱包没有 Binance handle，不能质押。</Red>;
    } else if (gamePassRequirement.hasNft) {
      accessStatus = (
        <Green>已有 AIPRO NFT，注册时会把它质押进这局游戏。</Green>
      );
    } else {
      accessStatus = <Red>还没有 AIPRO NFT。先取得一枚再来注册。</Red>;
    }

    return (
      <div className="max-w-xl rounded-lg border border-pink-400 bg-black/40 p-4 text-sm text-white">
        <div className="mb-2 text-lg font-semibold text-pink-300">
          质押 AIPRO NFT 才能进入
        </div>
        <div>
          这只钱包需要有 Binance handle，并持有一枚 AIPRO
          NFT。注册时会把那一枚质押进这局游戏。质押的 NFT
          可以随时取出，取出后这只钱包不能行动。
        </div>
        <div className="mt-3 space-y-1">
          <div>状态：{accessStatus}</div>
        </div>
        {gamePassRequirement.error && (
          <div className="mt-3 rounded border border-yellow-400 bg-yellow-900/30 p-3 text-yellow-200">
            {gamePassRequirement.error}
          </div>
        )}
      </div>
    );
  };

  const renderRegistrationControls = () => {
    if (state.isPlayerRegistered) {
      return (
        <div className="flex flex-col gap-2">
          <div className="text-sm">
            <Green>You are already registered as a player.</Green>
          </div>
          <div className="text-sm">
            Address:{" "}
            <span className="font-semibold">
              {ethConnection.getAddress() || "Not connected"}
            </span>
          </div>
          {state.playerName && (
            <div className="text-sm">
              Your Player Name: <Green>{state.playerName}</Green>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-4">
        {renderGamePassRequirement()}
        <div className="flex flex-col gap-2">
          <br />
          <br />

          <div className="flex items-center gap-2">
            <StyledInput
              type="text"
              placeholder="eg: john"
              value={state.playerName}
              onChange={handlePlayerNameChange}
            />
          </div>
        </div>

        <PlayerNameLabel>
          {state.playerName ? (
            <div>
              <PlayerNameValue> {state.playerName}</PlayerNameValue>
            </div>
          ) : (
            <NotSetText>Not Set Yet</NotSetText>
          )}
        </PlayerNameLabel>

        {ethConnection.getAddress() && (
          <div>
            <PinkButton
              onClick={registerPlayerAction}
              disabled={!state.playerName || !redPillWalletClient}
            >
              {state.playerName
                ? `Register as "${state.playerName}"`
                : "Please Enter Your Name"}
            </PinkButton>
          </div>
        )}
      </div>
    );
  };

  const renderStatusMessages = () => (
    <div>
      {registrationMessage && (
        <div>
          {registrationMessage.includes("successfully") ? (
            <Green>{registrationMessage}</Green>
          ) : (
            <Red>{registrationMessage}</Red>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <div className="flex flex-col gap-6">
        <div className="rounded-lg">{renderRegistrationControls()}</div>
        {renderStatusMessages()}
      </div>
    </div>
  );
};
