import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  MULTICALL3,
  WORLD,
  verifyBuySilverOrder,
} from "../../../skills/darkforest-punk-player/check-buy-silver.mjs";

const BYTECODE = readFileSync(
  new URL("../../contracts/script/multicall3.bytecode", import.meta.url),
  "utf8",
).trim();
const ZERO = "0x" + "0".repeat(64);
const TOKEN = "0x0000000000000000000000000000000000000101";
const SPENDER = "0x0000000000000000000000000000000000000102";
const PLAYER = "0x0000000000000000000000000000000000000103";
const OTHER = "0x0000000000000000000000000000000000000104";
const BLOCK = "0x42";
const HASH = "0x" + "aa".repeat(32);
const DFX_STAR =
  "0x7462646600000000000000000000000044465853746172436f6e666967000000";
const ENTRY_FEE =
  "0x74626466000000000000000000000000456e7472794665650000000000000000";
const SYSTEMS =
  "0x7462776f726c6400000000000000000053797374656d73000000000000000000";
const SELECTORS =
  "0x7462776f726c6400000000000000000046756e6374696f6e53656c6563746f72";
const BUY_SYSTEM =
  "0x7379646600000000000000000000000042757953696c76657253797374656d00";

const order = {
  kind: "darkforest-buy-silver",
  call: "df__buySilver",
  chainId: 56,
  worldAddress: WORLD,
  planetHash: "123",
  planetHashHex: "7b".padStart(64, "0"),
  tier: 1,
  priceWei: "2500000000000000000000",
  priceWhole: "2500",
  silverDisplay: "50",
  entryFeeWei: "1",
  paymentToken: TOKEN,
  buySilverSystem: SPENDER,
};

function cast(...args) {
  return execFileSync("cast", args, { encoding: "utf8" }).trim();
}

const calldata = (signature, ...args) => cast("calldata", signature, ...args);
const encoded = (signature, ...args) => cast("abi-encode", signature, ...args);
const record = (data) => encoded("f(bytes,bytes32,bytes)", data, ZERO, "0x");
const buySig = cast("sig", "buySilver(uint256,uint8)");
const quoteSig = cast("sig", "quoteBuySilver(uint256,uint8)");

function fixture(options = {}) {
  const {
    code = BYTECODE,
    missingCodeAt,
    chain = "0x38",
    fee = 1,
    token = TOKEN,
    spender = SPENDER,
    binding = WORLD,
    price = order.priceWei,
    silver = "50000",
    balance = price,
    buyRoute = BUY_SYSTEM + buySig.slice(2),
    failStageOne = false,
    changedBlock = false,
  } = options;
  const asks = [];
  let stage = 0;
  const unsigned = (value) => encoded("f(uint256)", String(value));

  const first = [
    record(
      OTHER +
        token.slice(2) +
        OTHER.slice(2).repeat(2) +
        spender.slice(2) +
        "1388",
    ),
    record(unsigned(fee)),
    record(SPENDER + "01"),
    record(buyRoute),
    record(BUY_SYSTEM + quoteSig.slice(2)),
    encoded("f(uint256,uint256)", price, silver),
  ];
  const second = [
    encoded("f(address)", binding),
    unsigned(balance),
    unsigned(7),
  ];
  const rpc = async (method, params) => {
    asks.push([method, params]);
    switch (method) {
      case "eth_chainId":
        return chain;
      case "eth_getBlockByNumber":
        return {
          number: BLOCK,
          hash: changedBlock && params[0] === BLOCK ? ZERO : HASH,
        };
      case "eth_getCode":
        if (params[0] === missingCodeAt) return "0x";
        return params[0] === MULTICALL3 ? code : "0x01";
      case "eth_call": {
        const values = stage++ === 0 ? first : second;
        const rows = values.map((value, index) =>
          failStageOne && stage === 1 && index === 0
            ? "(false,0x)"
            : `(true,${value})`,
        );
        return encoded("f((bool,bytes)[])", `[${rows.join(",")}]`);
      }
      default:
        throw new Error(`Unexpected RPC request ${method}`);
    }
  };
  return { rpc, asks };
}

test("verifies both ordered Multicall stages at the same verified block", async () => {
  const { rpc, asks } = fixture();
  const result = await verifyBuySilverOrder({
    order,
    player: PLAYER,
    signerChainId: 56,
    rpc,
  });
  assert.deepEqual(result, {
    blockNumber: BLOCK,
    chainId: 56,
    worldAddress: WORLD,
    player: PLAYER,
    paymentToken: TOKEN,
    buySilverSystem: SPENDER,
    planetHash: order.planetHash,
    priceWei: order.priceWei,
    priceWhole: order.priceWhole,
    tier: order.tier,
    silverDisplay: order.silverDisplay,
    entryFeeWei: order.entryFeeWei,
    balanceWei: order.priceWei,
    allowanceWei: "7",
  });
  const routeKey = (sig) => cast("sig", sig).padEnd(66, "0");
  const table = (id, keys = []) =>
    calldata("getRecord(bytes32,bytes32[])", id, `[${keys.join(",")}]`);
  const group = (calls) =>
    calldata(
      "aggregate3((address,bool,bytes)[])",
      `[${calls.map(([target, data]) => `(${target},false,${data})`).join(",")}]`,
    );
  const buy = "df__buySilver(uint256,uint8)";
  const quote = "df__quoteBuySilver(uint256,uint8)";
  assert.deepEqual(asks, [
    ["eth_chainId", []],
    ["eth_getBlockByNumber", ["latest", false]],
    ["eth_getCode", [MULTICALL3, BLOCK]],
    ["eth_getCode", [WORLD, BLOCK]],
    [
      "eth_call",
      [
        {
          to: MULTICALL3,
          data: group([
            [WORLD, table(DFX_STAR)],
            [WORLD, table(ENTRY_FEE)],
            [WORLD, table(SYSTEMS, [BUY_SYSTEM])],
            [WORLD, table(SELECTORS, [routeKey(buy)])],
            [WORLD, table(SELECTORS, [routeKey(quote)])],
            [WORLD, calldata(quote, order.planetHash, String(order.tier))],
          ]),
        },
        BLOCK,
      ],
    ],
    ["eth_getCode", [SPENDER, BLOCK]],
    ["eth_getCode", [TOKEN, BLOCK]],
    [
      "eth_call",
      [
        {
          to: MULTICALL3,
          data: group([
            [SPENDER, calldata("trustedWorld()")],
            [TOKEN, calldata("balanceOf(address)", PLAYER)],
            [TOKEN, calldata("allowance(address,address)", PLAYER, SPENDER)],
          ]),
        },
        BLOCK,
      ],
    ],
    ["eth_getBlockByNumber", [BLOCK, false]],
  ]);
});

test("wrong signer chain, clipboard chain, or clipboard World never reaches RPC", async () => {
  const { rpc, asks } = fixture();
  await assert.rejects(
    verifyBuySilverOrder({ order, player: PLAYER, signerChainId: 10, rpc }),
    /signer chain/,
  );
  await assert.rejects(
    verifyBuySilverOrder({
      order: { ...order, chainId: 10 },
      player: PLAYER,
      signerChainId: 56,
      rpc,
    }),
    /Order chain/,
  );
  await assert.rejects(
    verifyBuySilverOrder({
      order: { ...order, worldAddress: OTHER },
      player: PLAYER,
      signerChainId: 56,
      rpc,
    }),
    /Order World/,
  );
  assert.deepEqual(asks, []);
});

for (const [name, options, message, expectedCalls] of [
  ["RPC chain", { chain: "0xa" }, /RPC chain/, 0],
  ["Multicall3 bytecode", { code: "0x01" }, /Invalid Multicall3/, 0],
  ["World bytecode", { missingCodeAt: WORLD }, /Missing World contract code/, 0],
  [
    "spender bytecode",
    { missingCodeAt: SPENDER },
    /Missing registered spender contract code/,
    1,
  ],
  [
    "token bytecode",
    { missingCodeAt: TOKEN },
    /Missing payment token contract code/,
    1,
  ],
  [
    "required subcall",
    { failStageOne: true },
    /required Multicall3 read failed/,
    1,
  ],
  ["payment token", { token: OTHER }, /payment token changed/, 1],
  ["registered spender", { spender: OTHER }, /spender does not match/, 1],
  [
    "World purchase route",
    { buyRoute: ZERO + buySig.slice(2) },
    /buy-silver routing/,
    1,
  ],
  [
    "live token price",
    { price: "2500000000000000000001" },
    /live World quote/,
    1,
  ],
  ["live silver pack", { silver: "50001" }, /live World quote/, 1],
  ["native entry fee", { fee: 2 }, /entry fee changed/, 1],
  ["trusted World binding", { binding: OTHER }, /not bound/, 2],
  ["available token balance", { balance: "0" }, /insufficient AIPRO/, 2],
  ["pinned block hash", { changedBlock: true }, /Pinned block changed/, 2],
]) {
  test(`fails closed on ${name}`, async () => {
    const { rpc, asks } = fixture(options);
    await assert.rejects(
      verifyBuySilverOrder({ order, player: PLAYER, signerChainId: 56, rpc }),
      message,
    );
    const contractCalls = asks.filter(([method]) => method === "eth_call");
    assert.equal(contractCalls.length, expectedCalls);
    assert.ok(
      contractCalls.every(
        ([, [{ to }, blockNumber]]) =>
          to === MULTICALL3 && blockNumber === BLOCK,
      ),
    );
  });
}
