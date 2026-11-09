import { appendFile, mkdir, readFile, rmdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { providers, utils } from "ethers";
import { privateKeyToAccount } from "viem/accounts";
import {
  buildRound,
  checkPlanOwnership,
  describeAction,
  prepareAction,
  readEvacuationReceipt,
  readRpc,
} from "./early-center.mjs";

export async function executeEarlyCenterRound(
  folder,
  account,
  { signal } = {},
) {
  signal?.throwIfAborted();
  const { address } = JSON.parse(
    await readFile(join(folder, "agent.json"), "utf8"),
  );
  if (
    account?.address?.toLowerCase() !== address.toLowerCase() ||
    typeof account.signTransaction !== "function"
  ) {
    throw new Error("An in-memory signer matching the save is required");
  }

  const lock = join(folder, ".early-center.lock");
  await mkdir(lock);
  try {
    const { snapshot, actions, result } = await buildRound(folder);
    const confirmed = [];
    if (!actions.length) return { ...result, actions: confirmed };
    const startingNonce = BigInt(
      await readRpc("eth_getTransactionCount", [
        snapshot.player,
        snapshot.block,
      ]),
    );
    const provider = new providers.JsonRpcProvider(
      "http://127.0.0.1:8545",
      31337,
    );
    let balance = snapshot.balance;
    for (const action of actions) {
      signal?.throwIfAborted();
      try {
        const tx = await prepareAction(snapshot, action);
        const nonce = startingNonce + BigInt(confirmed.length);
        const receipt = await submit(
          folder,
          account,
          provider,
          snapshot,
          action,
          tx,
          nonce,
          balance,
          signal,
        );
        balance -= receipt.cost;
        confirmed.push({
          ...describeAction(action, snapshot.tickRate),
          tx: receipt.tx,
          receiptBlock: receipt.receiptBlock,
        });
      } catch (error) {
        if (error.name === "AbortError") throw error;
        throw new Error(
          `Action ${confirmed.length + 1} (${action.action}) stopped the round after ${confirmed.length} confirmed transactions: ${error.message}`,
          { cause: error },
        );
      }
    }
    return { ...result, actions: confirmed };
  } finally {
    await rmdir(lock);
  }
}

export async function runEarlyCenterStrategy(
  folder,
  account,
  { intervalMs = 3_000, signal, onRound = console.log } = {},
) {
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1000) {
    throw new Error("Round interval must be at least one second");
  }
  // Only one round may run at a time, including receipt and log handling.
  try {
    while (!signal?.aborted) {
      await onRound(await executeEarlyCenterRound(folder, account, { signal }));
      await delay(intervalMs, undefined, { signal });
    }
  } catch (error) {
    if (
      !signal?.aborted ||
      (error !== signal.reason && error.name !== "AbortError")
    )
      throw error;
  }
}

async function submit(
  folder,
  account,
  provider,
  snapshot,
  plan,
  tx,
  nonce,
  balance,
  signal,
) {
  signal?.throwIfAborted();
  if (account.address.toLowerCase() !== tx.from)
    throw new Error("Signer changed after planning");
  if (
    nonce !==
    BigInt(await readRpc("eth_getTransactionCount", [tx.from, "pending"]))
  ) {
    throw new Error("Wallet nonce changed since the decision snapshot");
  }
  if (
    (await readRpc("eth_getBlockByNumber", [snapshot.block, false])).hash !==
    snapshot.blockHash
  ) {
    throw new Error("Decision block changed");
  }
  await checkPlanOwnership(plan, tx);
  const gas =
    (BigInt((await provider.estimateGas(tx)).toString()) * 120n) / 100n;
  const gasPrice = BigInt((await provider.getGasPrice()).toString());
  const value = BigInt(tx.value);
  if (balance < gas * gasPrice + value)
    throw new Error("Insufficient local ETH");
  signal?.throwIfAborted();
  const raw = await account.signTransaction({
    chainId: 31337,
    type: "legacy",
    nonce: Number(nonce),
    to: tx.to,
    data: tx.data,
    value,
    gas,
    gasPrice,
  });
  signal?.throwIfAborted();
  const hash = utils.keccak256(raw);
  try {
    await provider.send("eth_sendRawTransaction", [raw]);
    const receipt = await provider.waitForTransaction(hash, 1, 30_000);
    if (receipt.status !== 1) throw new Error("Transaction reverted");
    const block = await provider.getBlock(receipt.blockNumber);
    const evacuation =
      plan.purpose === "evacuate"
        ? {
            ...readEvacuationReceipt(receipt, tx, plan),
            snapshotTick: snapshot.tick,
          }
        : {};
    const row = {
      time: new Date(block.timestamp * 1000).toISOString(),
      strategy: "early-center.mjs",
      action: plan.action,
      purpose: plan.purpose,
      tx: receipt.transactionHash,
      block: receipt.blockNumber,
      detail: `(${plan.target.x},${plan.target.y})`,
      ...(plan.from
        ? {
            from: plan.from.hash,
            to: plan.target.hash,
            population: String(plan.sent),
            silver: String(plan.silver ?? 0),
            materials: plan.materials,
          }
        : { planet: plan.target.hash }),
      ...evacuation,
    };
    await appendFile(
      join(folder, "actions.ndjson"),
      JSON.stringify(row) + "\n",
    );
    const cost =
      BigInt(receipt.gasUsed.toString()) *
        BigInt(receipt.effectiveGasPrice.toString()) +
      value;
    return { tx: row.tx, receiptBlock: row.block, cost };
  } catch (error) {
    throw new Error(
      `Check transaction ${hash} before retrying: ${error.message}`,
      { cause: error },
    );
  }
}

async function readTerminalAccount() {
  if (!process.stdin.isTTY)
    throw new Error(
      "Use an interactive terminal or pass an in-memory account to the module",
    );
  const muted = new Writable({
    write(_chunk, _encoding, done) {
      done();
    },
  });
  const prompt = createInterface({
    input: process.stdin,
    output: muted,
    terminal: true,
    historySize: 0,
  });
  const abort = new AbortController();
  prompt.on("SIGINT", () => abort.abort());
  process.stderr.write("本地测试钱包私钥（输入不回显） ");
  try {
    const key = (await prompt.question("", { signal: abort.signal })).trim();
    if (!/^(0x)?[0-9a-f]{64}$/i.test(key))
      throw new Error("Expected a 32-byte private key");
    return privateKeyToAccount("0x" + key.replace(/^0x/i, ""));
  } finally {
    prompt.close();
    process.stderr.write("\n");
  }
}

async function main() {
  const [, , folder, mode, interval, ...extra] = process.argv;
  if (
    !folder ||
    !["--execute", "--watch"].includes(mode) ||
    extra.length ||
    (interval !== undefined && (mode !== "--watch" || !/^\d+$/.test(interval)))
  ) {
    throw new Error(
      "Usage: node packages/client/scripts/early-center/early-center-execute.mjs <wallet-save-dir> --execute | --watch [interval-seconds]",
    );
  }
  const saveDir = resolve(folder);
  const account = await readTerminalAccount();
  const abort = new AbortController();
  const stop = () => abort.abort();
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  try {
    if (mode === "--watch") {
      await runEarlyCenterStrategy(saveDir, account, {
        intervalMs:
          interval === undefined ? undefined : Number(interval) * 1000,
        signal: abort.signal,
        onRound: (result) => console.log(JSON.stringify(result)),
      });
    } else {
      console.log(
        JSON.stringify(
          await executeEarlyCenterRound(saveDir, account, {
            signal: abort.signal,
          }),
          null,
          2,
        ),
      );
    }
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    await main();
  } catch (error) {
    if (error.name !== "AbortError") {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
