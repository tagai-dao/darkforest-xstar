import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

export const CHAIN_ID = 56;
export const WORLD = "0xfad1cddad97113e4c0335ff5a815955c21b2ddca";
export const MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11";
export const MULTICALL3_CODE_HASH =
  "0xd5c15df687b16f2ff992fc8d767b4216323184a2bbc6ee2f9c398c318e770891";

const DEFAULT_RPC = "https://bsc.publicnode.com";
const ZERO_WORD = "0x" + "0".repeat(64);
const MAX_UINT = 2n ** 256n - 1n;
const AIPRO_UNITS = 10n ** 18n;
const SILVER_UNITS = 1000n;
const BUY_SIGNATURE = "buySilver(uint256,uint8)";
const QUOTE_SIGNATURE = "quoteBuySilver(uint256,uint8)";
const AGGREGATE_SIGNATURE = "aggregate3((address,bool,bytes)[])";

function resourceId(type, namespace, name) {
  const id = Buffer.alloc(32);
  id.write(type, 0, 2, "ascii");
  id.write(namespace, 2, 14, "ascii");
  id.write(name, 16, 16, "ascii");
  return "0x" + id.toString("hex");
}

const DFX_STAR = resourceId("tb", "df", "DFXStarConfig");
const ENTRY_FEE = resourceId("tb", "df", "EntryFee");
const SYSTEMS = resourceId("tb", "world", "Systems");
const SELECTORS = resourceId("tb", "world", "FunctionSelector");
const BUY_SYSTEM = resourceId("sy", "df", "BuySilverSystem");

function cast(...args) {
  return execFileSync("cast", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 10_000,
  }).trim();
}

function decode(signature, data) {
  return JSON.parse(cast("decode-abi", "--json", signature, data));
}

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function address(value, label) {
  requireValue(
    typeof value === "string" &&
      /^0x[0-9a-f]{40}$/i.test(value) &&
      !/^0x0{40}$/i.test(value),
    `Invalid ${label} address`,
  );
  return value.toLowerCase();
}

function uint(value, label) {
  requireValue(
    typeof value === "string" && /^(0|[1-9]\d{0,77})$/.test(value),
    `Invalid ${label}`,
  );
  const result = BigInt(value);
  requireValue(result <= MAX_UINT, `Invalid ${label}`);
  return result;
}

function hexData(value, length) {
  return (
    typeof value === "string" &&
    /^0x(?:[0-9a-f]{2})*$/i.test(value) &&
    (length === undefined || value.length === 2 + 2 * length)
  );
}

function recordCall(table, keys = []) {
  return [
    WORLD,
    cast(
      "calldata",
      "getRecord(bytes32,bytes32[])",
      table,
      `[${keys.join(",")}]`,
    ),
  ];
}

function staticRecord(data, bytes, name) {
  const [record, dynamicLengths, dynamicData] = decode(
    "getRecord(bytes32,bytes32[])(bytes,bytes32,bytes)",
    data,
  );
  requireValue(
    hexData(record, bytes) &&
      dynamicLengths === ZERO_WORD &&
      dynamicData === "0x",
    `Missing or malformed ${name} World record`,
  );
  return record.toLowerCase();
}

function recordAddress(record, offset, label) {
  return address("0x" + record.slice(2 + offset * 2, 42 + offset * 2), label);
}

function routeKey(worldSignature) {
  return cast("sig", worldSignature).padEnd(66, "0");
}

function verifyRoute(data, systemSignature, label) {
  const record = staticRecord(data, 36, label);
  requireValue(
    record.slice(0, 66) === BUY_SYSTEM &&
      record.slice(66) === cast("sig", systemSignature).slice(2),
    `Unexpected ${label} routing in the World`,
  );
}

function validateOrder(order) {
  requireValue(
    order &&
      order.kind === "darkforest-buy-silver" &&
      order.call === "df__buySilver",
    "Invalid buy-silver order",
  );
  requireValue(order.chainId === CHAIN_ID, "Order chain does not match BSC");
  requireValue(
    address(order.worldAddress, "order World") === WORLD,
    "Order World does not match the trusted World",
  );
  requireValue(
    Number.isInteger(order.tier) && order.tier >= 0 && order.tier <= 3,
    "Invalid tier",
  );
  const planet = uint(order.planetHash, "planet hash");
  requireValue(
    planet > 0n &&
      typeof order.planetHashHex === "string" &&
      /^[0-9a-f]{64}$/i.test(order.planetHashHex) &&
      BigInt("0x" + order.planetHashHex) === planet,
    "Order planet hash representations do not match",
  );
  const price = uint(order.priceWei, "priceWei");
  const priceWhole = uint(order.priceWhole, "priceWhole");
  const silverDisplay = uint(order.silverDisplay, "silverDisplay");
  requireValue(
    price > 0n && priceWhole * AIPRO_UNITS === price && silverDisplay > 0n,
    "Invalid order price or pack",
  );
  return {
    planet,
    price,
    priceWhole,
    silverDisplay,
    tier: order.tier,
    entryFee: uint(order.entryFeeWei, "entryFeeWei"),
    paymentToken: address(order.paymentToken, "order payment token"),
    spender: address(order.buySilverSystem, "order spender"),
  };
}

async function requireContractCode(rpc, target, blockNumber, label) {
  const code = await rpc("eth_getCode", [target, blockNumber]);
  requireValue(hexData(code) && code !== "0x", `Missing ${label} contract code`);
  return code;
}

async function aggregate(rpc, blockNumber, calls) {
  const payload = cast(
    "calldata",
    AGGREGATE_SIGNATURE,
    `[${calls.map(([target, data]) => `(${target},false,${data})`).join(",")}]`,
  );
  const result = await rpc("eth_call", [
    { to: MULTICALL3, data: payload },
    blockNumber,
  ]);
  requireValue(
    hexData(result) && result !== "0x",
    "Missing Multicall3 response",
  );
  const [rows] = decode(`${AGGREGATE_SIGNATURE}((bool,bytes)[])`, result);
  requireValue(
    Array.isArray(rows) &&
      rows.length === calls.length &&
      rows.every(
        ([success, data]) => success === true && hexData(data) && data !== "0x",
      ),
    "A required Multicall3 read failed or returned no data",
  );
  return rows.map(([, data]) => data);
}

export async function verifyBuySilverOrder({
  order,
  player,
  signerChainId,
  rpc,
}) {
  const intent = validateOrder(order);
  const buyer = address(player, "active signer");
  requireValue(
    signerChainId === CHAIN_ID,
    "Active signer chain does not match BSC",
  );
  requireValue(
    (await rpc("eth_chainId", [])) === "0x38",
    "RPC chain does not match BSC",
  );

  const block = await rpc("eth_getBlockByNumber", ["latest", false]);
  requireValue(
    block &&
      typeof block.number === "string" &&
      /^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(block.number) &&
      hexData(block.hash, 32),
    "Could not anchor a World snapshot",
  );
  const blockNumber = block.number;
  const code = await requireContractCode(rpc, MULTICALL3, blockNumber, "Multicall3");
  requireValue(
    cast("keccak", code) === MULTICALL3_CODE_HASH,
    "Invalid Multicall3 runtime bytecode on BSC",
  );
  await requireContractCode(rpc, WORLD, blockNumber, "World");

  const worldBuy = "df__" + BUY_SIGNATURE;
  const worldQuote = "df__" + QUOTE_SIGNATURE;
  const [configData, feeData, systemData, buyRoute, quoteRoute, quoteData] =
    await aggregate(rpc, blockNumber, [
      recordCall(DFX_STAR),
      recordCall(ENTRY_FEE),
      recordCall(SYSTEMS, [BUY_SYSTEM]),
      recordCall(SELECTORS, [routeKey(worldBuy)]),
      recordCall(SELECTORS, [routeKey(worldQuote)]),
      [
        WORLD,
        cast(
          "calldata",
          worldQuote,
          intent.planet.toString(),
          intent.tier.toString(),
        ),
      ],
    ]);
  const config = staticRecord(configData, 102, "DFXStarConfig");
  const paymentToken = recordAddress(config, 20, "configured payment token");
  const configuredSpender = recordAddress(config, 80, "configured spender");
  const system = staticRecord(systemData, 21, "Systems");
  const spender = recordAddress(system, 0, "registered spender");
  requireValue(
    system.slice(42) === "01",
    "BuySilverSystem is not open on the World",
  );
  requireValue(
    paymentToken === intent.paymentToken,
    "Order payment token changed",
  );
  requireValue(
    spender === configuredSpender && spender === intent.spender,
    "Order spender does not match the World",
  );
  verifyRoute(buyRoute, BUY_SIGNATURE, "buy-silver");
  verifyRoute(quoteRoute, QUOTE_SIGNATURE, "quote");

  const entryFee = BigInt(staticRecord(feeData, 32, "EntryFee"));
  requireValue(entryFee === intent.entryFee, "Order entry fee changed");
  requireValue(hexData(quoteData, 64), "Invalid World quote response");
  const [price, silver] = decode(
    `${worldQuote}(uint256,uint256)`,
    quoteData,
  ).map(BigInt);
  requireValue(
    price === intent.price && silver === intent.silverDisplay * SILVER_UNITS,
    "Order does not match the live World quote",
  );

  await requireContractCode(rpc, spender, blockNumber, "registered spender");
  await requireContractCode(rpc, paymentToken, blockNumber, "payment token");
  const [binding, balance, allowance] = await aggregate(rpc, blockNumber, [
    [spender, cast("calldata", "trustedWorld()")],
    [paymentToken, cast("calldata", "balanceOf(address)", buyer)],
    [
      paymentToken,
      cast("calldata", "allowance(address,address)", buyer, spender),
    ],
  ]);
  requireValue(
    hexData(binding, 32) &&
      address(
        decode("trustedWorld()(address)", binding)[0],
        "spender World",
      ) === WORLD,
    "Registered spender is not bound to the trusted World",
  );
  requireValue(
    hexData(balance, 32) && hexData(allowance, 32),
    "Invalid token balance or allowance",
  );
  const balanceWei = BigInt(balance);
  const allowanceWei = BigInt(allowance);
  requireValue(balanceWei >= price, "Active signer has insufficient AIPRO");

  const confirmed = await rpc("eth_getBlockByNumber", [blockNumber, false]);
  requireValue(
    confirmed?.number === blockNumber && confirmed?.hash === block.hash,
    "Pinned block changed during verification",
  );

  return {
    chainId: CHAIN_ID,
    worldAddress: WORLD,
    blockNumber,
    player: buyer,
    paymentToken,
    buySilverSystem: spender,
    planetHash: intent.planet.toString(),
    tier: intent.tier,
    priceWei: price.toString(),
    priceWhole: intent.priceWhole.toString(),
    silverDisplay: intent.silverDisplay.toString(),
    entryFeeWei: entryFee.toString(),
    balanceWei: balanceWei.toString(),
    allowanceWei: allowanceWei.toString(),
  };
}

function createRpc(endpoint) {
  const url = new URL(endpoint);
  requireValue(url.protocol === "https:", "Use a BSC HTTPS RPC endpoint");
  let id = 0;
  return async (method, params) => {
    const requestId = ++id;
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }),
      redirect: "error",
      signal: AbortSignal.timeout(12_000),
    });
    requireValue(response.ok, `RPC failed for ${method}`);
    const payload = await response.json();
    requireValue(
      payload?.id === requestId &&
        payload.jsonrpc === "2.0" &&
        !payload.error &&
        Object.hasOwn(payload, "result"),
      `Invalid RPC response for ${method}`,
    );
    return payload.result;
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const { values } = parseArgs({
      options: {
        player: { type: "string" },
        "signer-chain-id": { type: "string" },
        "order-file": { type: "string" },
        rpc: { type: "string", default: DEFAULT_RPC },
      },
    });
    requireValue(
      values["order-file"] &&
        values.player &&
        values["signer-chain-id"] === CHAIN_ID.toString(),
      "Pass --player, --signer-chain-id 56 and --order-file",
    );
    const text = readFileSync(values["order-file"], "utf8").trim();
    const order = JSON.parse(text.replace(/^DARKFOREST_BUY_SILVER\r?\n/, ""));
    const result = await verifyBuySilverOrder({
      order,
      player: values.player,
      signerChainId: Number(values["signer-chain-id"]),
      rpc: createRpc(values.rpc),
    });
    console.log(JSON.stringify(result));
  } catch (error) {
    const message =
      error?.code === "ENOENT" && error.path === "cast"
        ? "Foundry cast is required for ABI encoding"
        : error.message;
    console.error(`Buy-silver preflight rejected: ${message}`);
    process.exitCode = 1;
  }
}
