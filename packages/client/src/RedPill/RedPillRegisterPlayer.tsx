import { addressToHex } from "@df/serde";
import { Green, Red } from "@frontend/Components/Text";
import { getComponentValue } from "@latticexyz/recs";
import { encodeEntity, singletonEntity } from "@latticexyz/store-sync/recs";
import { useMUD } from "@mud/MUDContext";
import React, { useCallback, useEffect, useState } from "react";
import styled from "styled-components";
import {
  createWalletClient,
  encodeFunctionData,
  formatUnits,
  http,
  parseAbi,
  zeroAddress,
  type Address,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { EthConnection } from "@df/network";
import { observer } from "@latticexyz/explorer/observer";
import { transactionQueue, writeObserver } from "@latticexyz/common/actions";
import type { EthAddress } from "@df/types";

const GAME_PASS_ABI = parseAbi([
  "function paymentToken() view returns (address)",
  "function price() view returns (uint256)",
  "function isBoundToCurrentRound(address player) view returns (bool)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenBoundPlayer(uint256 tokenId) view returns (address)",
  "function buyPass() returns (uint256)",
  "function bindToCurrentRound(uint256 tokenId)",
]);

const ERC20_ABI = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
]);

type GamePassRequirement = {
  isEnabled: boolean;
  isLoading: boolean;
  isBound: boolean;
  hasUnboundPass: boolean;
  tokenBalance?: bigint;
  passPrice?: bigint;
  paymentToken?: Address;
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
      isBound: false,
      hasUnboundPass: false,
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
    const checkPlayerRegistration = async () => {
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

  const formatTokenAmount = (amount?: bigint) =>
    amount === undefined ? "-" : formatUnits(amount, 18);

  const writeAndWait = async (
    walletClient: WalletClient,
    request: Record<string, unknown>,
  ) => {
    const writeClient = walletClient as WalletClient & {
      writeContract: (request: Record<string, unknown>) => Promise<`0x${string}`>;
    };
    const tx = await writeClient.writeContract({
      chain: publicClient.chain,
      account: walletClient.account,
      ...request,
    });
    await waitForTransaction(tx);
    return tx;
  };

  const findUnboundOwnedPass = async (
    passAddress: Address,
    playerAddress: Address,
  ) => {
    const balance = await publicClient.readContract({
      address: passAddress,
      abi: GAME_PASS_ABI,
      functionName: "balanceOf",
      args: [playerAddress],
    });

    for (let i = 0n; i < balance; i++) {
      const tokenId = await publicClient.readContract({
        address: passAddress,
        abi: GAME_PASS_ABI,
        functionName: "tokenOfOwnerByIndex",
        args: [playerAddress, i],
      });
      const boundPlayer = await publicClient.readContract({
        address: passAddress,
        abi: GAME_PASS_ABI,
        functionName: "tokenBoundPlayer",
        args: [tokenId],
      });

      if (boundPlayer === zeroAddress) {
        return tokenId;
      }
    }

    return undefined;
  };

  const refreshGamePassRequirement = useCallback(async () => {
    const playerAddress = toHexAddress(ethConnection.getAddress());
    const passAddress = getConfiguredGamePassAddress();
    if (!playerAddress || !passAddress) {
      setGamePassRequirement({
        isEnabled: !!passAddress,
        isLoading: false,
        isBound: false,
        hasUnboundPass: false,
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
      const [isBound, paymentToken, passPrice] = await Promise.all([
        publicClient.readContract({
          address: passAddress,
          abi: GAME_PASS_ABI,
          functionName: "isBoundToCurrentRound",
          args: [playerAddress],
        }),
        publicClient.readContract({
          address: passAddress,
          abi: GAME_PASS_ABI,
          functionName: "paymentToken",
        }),
        publicClient.readContract({
          address: passAddress,
          abi: GAME_PASS_ABI,
          functionName: "price",
        }),
      ]);

      const [tokenBalance, unboundTokenId] = await Promise.all([
        publicClient.readContract({
          address: paymentToken,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [playerAddress],
        }),
        findUnboundOwnedPass(passAddress, playerAddress),
      ]);

      setGamePassRequirement({
        isEnabled: true,
        isLoading: false,
        isBound,
        hasUnboundPass: unboundTokenId !== undefined,
        tokenBalance,
        passPrice,
        paymentToken,
      });
    } catch (error) {
      console.error("Failed to load Game Pass requirement:", error);
      setGamePassRequirement({
        isEnabled: true,
        isLoading: false,
        isBound: false,
        hasUnboundPass: false,
        error: "Unable to load Game Pass status. Please refresh and try again.",
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
    const alreadyBound = await publicClient.readContract({
      address: passAddress,
      abi: GAME_PASS_ABI,
      functionName: "isBoundToCurrentRound",
      args: [playerAddress],
    });
    if (alreadyBound) return;

    setRegistrationMessage("Preparing Game Pass...");
    let tokenId = await findUnboundOwnedPass(passAddress, playerAddress);

    if (!tokenId) {
      const paymentToken = await publicClient.readContract({
        address: passAddress,
        abi: GAME_PASS_ABI,
        functionName: "paymentToken",
      });
      const price = await publicClient.readContract({
        address: passAddress,
        abi: GAME_PASS_ABI,
        functionName: "price",
      });
      const tokenBalance = await publicClient.readContract({
        address: paymentToken,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [playerAddress],
      });
      if (tokenBalance < price) {
        throw new Error(
          `Game Pass requires ${formatTokenAmount(price)} MockToken, but this wallet only has ${formatTokenAmount(
            tokenBalance,
          )}. Ask the admin to mint test tokens to this main wallet, or pre-mint a Game Pass NFT.`,
        );
      }
      const allowance = await publicClient.readContract({
        address: paymentToken,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [playerAddress, passAddress],
      });

      if (allowance < price) {
        setRegistrationMessage("Approving Game Pass token payment...");
        await writeAndWait(walletClient, {
          address: paymentToken,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [passAddress, price],
        });
      }

      setRegistrationMessage("Buying Game Pass...");
      await writeAndWait(walletClient, {
        address: passAddress,
        abi: GAME_PASS_ABI,
        functionName: "buyPass",
      });

      const balanceAfterPurchase = await publicClient.readContract({
        address: passAddress,
        abi: GAME_PASS_ABI,
        functionName: "balanceOf",
        args: [playerAddress],
      });
      tokenId = await publicClient.readContract({
        address: passAddress,
        abi: GAME_PASS_ABI,
        functionName: "tokenOfOwnerByIndex",
        args: [playerAddress, balanceAfterPurchase - 1n],
      });
    }

    setRegistrationMessage("Binding Game Pass to this season...");
    await writeAndWait(walletClient, {
      address: passAddress,
      abi: GAME_PASS_ABI,
      functionName: "bindToCurrentRound",
      args: [tokenId],
    });
  };

  const getRegistrationErrorMessage = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("0xe450d38c")) {
      return "Not enough MockToken to buy a Game Pass NFT. Ask the admin to mint test tokens to your main wallet, or pre-mint a Game Pass NFT.";
    }
    if (message.includes("Game Pass requires")) {
      return message;
    }
    return "Registration failed. Please check your Game Pass NFT and MockToken status, then try again.";
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
        sendTransaction: (request: Record<string, unknown>) => Promise<`0x${string}`>;
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

    const needsMoreTokens =
      !gamePassRequirement.isBound &&
      !gamePassRequirement.hasUnboundPass &&
      gamePassRequirement.tokenBalance !== undefined &&
      gamePassRequirement.passPrice !== undefined &&
      gamePassRequirement.tokenBalance < gamePassRequirement.passPrice;

    return (
      <div className="max-w-xl rounded-lg border border-pink-400 bg-black/40 p-4 text-sm text-white">
        <div className="mb-2 text-lg font-semibold text-pink-300">
          Game Pass NFT Required
        </div>
        <div>
          To enter this season, your main wallet must own and bind a Game Pass
          NFT. If you do not already have one, registration will try to buy and
          bind one with MockToken first.
        </div>
        <div className="mt-3 space-y-1">
          <div>
            Access status:{" "}
            {gamePassRequirement.isLoading ? (
              "Checking..."
            ) : gamePassRequirement.isBound ? (
              <Green>Game Pass already bound</Green>
            ) : gamePassRequirement.hasUnboundPass ? (
              <Green>Unbound Game Pass found, registration will bind it</Green>
            ) : (
              <Red>No Game Pass found, registration will try to buy one</Red>
            )}
          </div>
          <div>
            NFT price: {formatTokenAmount(gamePassRequirement.passPrice)} MockToken
          </div>
          <div>
            Current wallet MockToken balance:{" "}
            {formatTokenAmount(gamePassRequirement.tokenBalance)}
          </div>
        </div>
        {needsMoreTokens && (
          <div className="mt-3 rounded border border-red-400 bg-red-900/30 p-3 text-red-200">
            Not enough MockToken to buy a Game Pass. Ask the admin to mint test
            tokens to your main wallet on /test, or pre-mint a Game Pass NFT.
          </div>
        )}
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
