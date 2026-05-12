import { useComponentValue } from "@latticexyz/react";
import { singletonEntity } from "@latticexyz/store-sync/recs";
import { useMUD } from "@mud/MUDContext";
import { useEffect, useMemo, useState } from "react";
import {
  formatUnits,
  isAddress,
  parseAbi,
  parseUnits,
  zeroAddress,
  type Address,
} from "viem";
import { useWalletClient } from "wagmi";

const GAME_PASS_ABI = parseAbi([
  "function owner() view returns (address)",
  "function paymentToken() view returns (address)",
  "function price() view returns (uint256)",
  "function ownerMint(address to) returns (uint256)",
  "function ownerMintBatch(address[] recipients)",
]);

const MOCK_TOKEN_ABI = parseAbi([
  "function owner() view returns (address)",
  "function mint(address to, uint256 amount)",
]);

type TokenMintRow = {
  recipient: Address;
  amount: bigint;
};

const normalizeAddress = (value: string): Address => {
  const trimmed = value.trim();
  if (!isAddress(trimmed)) {
    throw new Error(`Invalid address: ${value}`);
  }
  return trimmed as Address;
};

const parseTokenAmount = (value: string) => parseUnits(value.trim(), 18);

const parseTokenRows = (rows: string): TokenMintRow[] =>
  rows
    .split("\n")
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => {
      const [recipient, amount] = row.split(/[,\s]+/);
      if (!recipient || !amount) {
        throw new Error(`Invalid token mint row: ${row}`);
      }
      return {
        recipient: normalizeAddress(recipient),
        amount: parseTokenAmount(amount),
      };
    });

const parseAddressRows = (rows: string): Address[] =>
  rows
    .split("\n")
    .map((row) => row.trim())
    .filter(Boolean)
    .map(normalizeAddress);

export const GamePassAdminPanel = () => {
  const {
    network: { publicClient, waitForTransaction },
    components: { GamePassNFT },
  } = useMUD();
  const { data: walletClient } = useWalletClient();
  const gamePassConfig = useComponentValue(GamePassNFT, singletonEntity);

  const gamePassAddress = useMemo(() => {
    const addr = gamePassConfig?.addr as Address | undefined;
    return addr && addr !== zeroAddress ? addr : undefined;
  }, [gamePassConfig?.addr]);

  const [paymentToken, setPaymentToken] = useState<Address>();
  const [gamePassOwner, setGamePassOwner] = useState<Address>();
  const [tokenOwner, setTokenOwner] = useState<Address>();
  const [passPrice, setPassPrice] = useState<bigint>();
  const [tokenRecipient, setTokenRecipient] = useState("");
  const [tokenAmount, setTokenAmount] = useState("100000");
  const [batchTokenRows, setBatchTokenRows] = useState("");
  const [nftRecipient, setNftRecipient] = useState("");
  const [batchNftRows, setBatchNftRows] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    const loadGamePassInfo = async () => {
      if (!gamePassAddress) return;

      const [owner, token, price] = await Promise.all([
        publicClient.readContract({
          address: gamePassAddress,
          abi: GAME_PASS_ABI,
          functionName: "owner",
        }),
        publicClient.readContract({
          address: gamePassAddress,
          abi: GAME_PASS_ABI,
          functionName: "paymentToken",
        }),
        publicClient.readContract({
          address: gamePassAddress,
          abi: GAME_PASS_ABI,
          functionName: "price",
        }),
      ]);

      setGamePassOwner(owner);
      setPaymentToken(token);
      setPassPrice(price);

      const ownerOfToken = await publicClient.readContract({
        address: token,
        abi: MOCK_TOKEN_ABI,
        functionName: "owner",
      });
      setTokenOwner(ownerOfToken);
    };

    loadGamePassInfo().catch((error) => {
      console.error("Failed to load Game Pass admin info:", error);
      setStatus("Failed to load Game Pass info. Check console for details.");
    });
  }, [gamePassAddress, publicClient]);

  const writeAndWait = async (request: Record<string, unknown>) => {
    if (!walletClient) {
      throw new Error("Please connect an admin wallet first.");
    }

    const tx = await (
      walletClient as unknown as {
        writeContract: (request: Record<string, unknown>) => Promise<`0x${string}`>;
      }
    ).writeContract({
      account: walletClient.account,
      chain: walletClient.chain,
      ...request,
    });
    await waitForTransaction(tx);
    return tx;
  };

  const mintToken = async (recipient: Address, amount: bigint) => {
    if (!paymentToken) throw new Error("Mock token is not configured.");
    return writeAndWait({
      address: paymentToken,
      abi: MOCK_TOKEN_ABI,
      functionName: "mint",
      args: [recipient, amount],
    });
  };

  const mintNft = async (recipient: Address) => {
    if (!gamePassAddress) throw new Error("GamePassNFT is not configured.");
    return writeAndWait({
      address: gamePassAddress,
      abi: GAME_PASS_ABI,
      functionName: "ownerMint",
      args: [recipient],
    });
  };

  const handleSingleTokenMint = async () => {
    try {
      setStatus("Minting test tokens...");
      await mintToken(normalizeAddress(tokenRecipient), parseTokenAmount(tokenAmount));
      setStatus("Test tokens minted.");
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Token mint failed.");
    }
  };

  const handleBatchTokenMint = async () => {
    try {
      const rows = parseTokenRows(batchTokenRows);
      setStatus(`Minting test tokens for ${rows.length} recipients...`);

      // MockGameToken exposes single mint only; keep the batch flow simple and explicit.
      for (const row of rows) {
        await mintToken(row.recipient, row.amount);
      }

      setStatus(`Batch token mint complete: ${rows.length} recipients.`);
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Batch token mint failed.");
    }
  };

  const handleSingleNftMint = async () => {
    try {
      setStatus("Minting Game Pass NFT...");
      await mintNft(normalizeAddress(nftRecipient));
      setStatus("Game Pass NFT minted.");
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "NFT mint failed.");
    }
  };

  const handleBatchNftMint = async () => {
    try {
      if (!gamePassAddress) throw new Error("GamePassNFT is not configured.");
      const recipients = parseAddressRows(batchNftRows);
      setStatus(`Minting Game Pass NFTs for ${recipients.length} recipients...`);
      await writeAndWait({
        address: gamePassAddress,
        abi: GAME_PASS_ABI,
        functionName: "ownerMintBatch",
        args: [recipients],
      });
      setStatus(`Batch NFT mint complete: ${recipients.length} recipients.`);
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Batch NFT mint failed.");
    }
  };

  return (
    <div className="w-full max-w-xl rounded-lg bg-white p-6 text-gray-900 shadow-lg">
      <h2 className="mb-4 text-2xl font-semibold">Game Pass Admin</h2>

      <div className="mb-6 space-y-1 break-all text-sm">
        <div>GamePassNFT: {gamePassAddress ?? "Not configured"}</div>
        <div>GamePass owner: {gamePassOwner ?? "-"}</div>
        <div>Mock token: {paymentToken ?? "-"}</div>
        <div>Mock token owner: {tokenOwner ?? "-"}</div>
        <div>
          NFT price: {passPrice === undefined ? "-" : `${formatUnits(passPrice, 18)} tokens`}
        </div>
      </div>

      <div className="mb-8 rounded border border-gray-200 p-4">
        <h3 className="mb-3 text-lg font-medium">Mint Test Tokens</h3>
        <input
          value={tokenRecipient}
          onChange={(event) => setTokenRecipient(event.target.value)}
          className="mb-2 block w-full rounded border border-gray-300 px-3 py-2"
          placeholder="Recipient address"
        />
        <input
          value={tokenAmount}
          onChange={(event) => setTokenAmount(event.target.value)}
          className="mb-3 block w-full rounded border border-gray-300 px-3 py-2"
          placeholder="Token amount, e.g. 100000"
        />
        <button
          type="button"
          onClick={handleSingleTokenMint}
          className="w-full rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
        >
          Mint Tokens
        </button>

        <textarea
          value={batchTokenRows}
          onChange={(event) => setBatchTokenRows(event.target.value)}
          className="mt-4 block h-28 w-full rounded border border-gray-300 px-3 py-2"
          placeholder={"Batch format, one per line:\n0xabc...,100000\n0xdef...,50000"}
        />
        <button
          type="button"
          onClick={handleBatchTokenMint}
          className="mt-3 w-full rounded bg-indigo-500 px-4 py-2 text-white hover:bg-indigo-600"
        >
          Batch Mint Tokens
        </button>
      </div>

      <div className="rounded border border-gray-200 p-4">
        <h3 className="mb-3 text-lg font-medium">Mint Game Pass NFTs</h3>
        <input
          value={nftRecipient}
          onChange={(event) => setNftRecipient(event.target.value)}
          className="mb-3 block w-full rounded border border-gray-300 px-3 py-2"
          placeholder="Recipient address"
        />
        <button
          type="button"
          onClick={handleSingleNftMint}
          className="w-full rounded bg-pink-500 px-4 py-2 text-white hover:bg-pink-600"
        >
          Mint NFT
        </button>

        <textarea
          value={batchNftRows}
          onChange={(event) => setBatchNftRows(event.target.value)}
          className="mt-4 block h-28 w-full rounded border border-gray-300 px-3 py-2"
          placeholder={"Batch NFT recipients, one address per line:\n0xabc...\n0xdef..."}
        />
        <button
          type="button"
          onClick={handleBatchNftMint}
          className="mt-3 w-full rounded bg-purple-500 px-4 py-2 text-white hover:bg-purple-600"
        >
          Batch Mint NFTs
        </button>
      </div>

      {status && <div className="mt-4 rounded bg-gray-100 p-3 text-sm">{status}</div>}
    </div>
  );
};
