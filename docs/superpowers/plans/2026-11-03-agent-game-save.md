# Agent 游戏存档与只读页面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理员开的一局里，agent 用当前钱包买通行证并加入后，把该钱包的私有地图写到本地目录；页面只读这个目录并对照链上数据画图，不再保存私钥、不再自己挖矿。

**Architecture:** 存档是用户主目录下的文件夹，一局（链 + 世界合约 + 赛季）一层，其下一个钱包一层。纯函数模块负责读写这个目录。页面通过目录授权读取，把块灌进现有渲染器，归属和舰队仍从 MUD 链上状态读取。agent 侧的 Node 写入器使用同一模块追加块和交易；签名和发交易留在 agent 钱包，本计划不改 `TxExecutor`。

**Tech Stack:** TypeScript 5.6、Vitest、浏览器 File System Access API、现有 `PersistedChunk`、MUD 同步、Game Pass NFT（`buyPass` / `joinSeason`）。

## Global Constraints

- 页面不生成、不读取、不保存私钥。`skey-*` 与 `mud:burnerWallet` 不进入游戏目录。
- 上链动作由 agent 调用当前连接的钱包发送。页面不签名。
- 一局由管理员创建：部署世界并 `setActiveSeason(world, season)`。玩家只加入。
- 同一钱包在同一局只有一个目录。再次进入必须复用，不得另建。
- 目录只追加。读到不完整的最后一行就丢掉。同一块重复写入视为同一条。
- 归属、人口、舰队、交易成败以链为准。目录里的坐标和「准备做的动作」不能覆盖链上结果。
- 展示路径不得调用 `initMiningManager`，不得走现在的观战自动家坐标。
- 根目录默认 `~/Library/Application Support/darkforest-punk/`。skill 只问主人一次。
- 我们的服务器不保存这些文件。

---

## 文件职责

- Create: `packages/client/src/Backend/Save/GameSave.ts` — 路径、`agent.json`、块、家坐标、待确认交易的类型与纯读写。
- Create: `packages/client/src/Backend/Save/GameSave.test.ts` — 上述行为的 Vitest。
- Create: `packages/client/src/Backend/Save/FileChunkSource.ts` — 把一份 `GameSave` 适配成渲染器要的家坐标和 `knownBoard`。
- Modify: `packages/client/src/Backend/GameLogic/GameManagerFactory.ts` — 观看模式使用文件存档，并且不启动挖矿。
- Modify: `packages/client/src/Frontend/Pages/RedPillLandingPage.tsx` — 进入时选择钱包目录，不再自动挖、不再造钥匙。
- Create: `packages/client/src/agent/createGameFolder.ts` — agent 用当前钱包地址在指定局里创建或复用目录。
- Create: `packages/client/src/agent/createGameFolder.test.ts`
- Create: `docs/agent-game-skill.md` — 给 agent 的操作顺序。挖矿循环和 Groth16 证明沿用 `packages/client/src/Backend/Miner/miner.worker.ts` 与 `SnarkArgsHelper.ts`，在写入器能被测试通过之后再接，不在本计划里重写哈希。

现有 IndexedDB `PersistentChunkStore` 先留着。观看模式不调用它。确认文件观看可用之后，再删浏览器存档路径。

---

### Task 1: 游戏目录的路径和身份

**Files:**

- Create: `packages/client/src/Backend/Save/GameSave.ts`
- Test: `packages/client/src/Backend/Save/GameSave.test.ts`

**Interfaces:**

- Consumes: 无
- Produces:

  - `type GameId = { chainId: number; world: string; season: number }`
  - `type WalletSaveRef = { game: GameId; wallet: string }`
  - `gameFolderName(game: GameId): string` 形如 `31337-0xabc-1`
  - `walletFolderName(ref: WalletSaveRef): string` 形如 `31337-0xabc-1/0xdef`
  - `assertChecksumAddress(value: string): string` 非法地址抛 `Error`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { gameFolderName, walletFolderName } from "./GameSave";

describe("game folder names", () => {
  const game = {
    chainId: 31337,
    world: "0xbe09885633Df7DfEfB96517cd6547fd4516A2907",
    season: 1,
  };

  it("names a season folder from chain, world, and season", () => {
    expect(gameFolderName(game)).toBe(
      "31337-0xbe09885633df7dfefb96517cd6547fd4516a2907-1",
    );
  });

  it("puts one wallet inside that season", () => {
    expect(
      walletFolderName({
        game,
        wallet: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      }),
    ).toBe(
      "31337-0xbe09885633df7dfefb96517cd6547fd4516a2907-1/0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter client exec vitest run src/Backend/Save/GameSave.test.ts`
Expected: FAIL，`gameFolderName` 未定义。

- [ ] **Step 3: Write minimal implementation**

```ts
export type GameId = {
  chainId: number;
  world: string;
  season: number;
};

export type WalletSaveRef = {
  game: GameId;
  wallet: string;
};

function address(value: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`Invalid address: ${value}`);
  }
  return value.toLowerCase();
}

export function gameFolderName(game: GameId): string {
  return `${game.chainId}-${address(game.world)}-${game.season}`;
}

export function walletFolderName(ref: WalletSaveRef): string {
  return `${gameFolderName(ref.game)}/${address(ref.wallet)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter client exec vitest run src/Backend/Save/GameSave.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/Backend/Save/GameSave.ts packages/client/src/Backend/Save/GameSave.test.ts
git commit -m "feat: name local save folders by season and wallet"
```

---

### Task 2: 把浏览器存档写成文件

**Files:**

- Modify: `packages/client/src/Backend/Save/GameSave.ts`
- Modify: `packages/client/src/Backend/Save/GameSave.test.ts`

**Interfaces:**

- Consumes: `WalletSaveRef`、`walletFolderName`；`PersistedChunk` 来自 `packages/client/src/_types/darkforest/api/ChunkStoreTypes.ts`
- Produces:
  - `type AgentFile = { address: string }`
  - `type GameSaveFiles = { agent: AgentFile; chunks: PersistedChunk[]; homeLocations: WorldLocation[]; pendingTxs: { hash: string; intent: unknown }[] }`
  - `serializeGameSave(save: GameSaveFiles): Map<string, string>` 相对钱包目录的路径到文件正文
  - `parseGameSave(files: Map<string, string>): GameSaveFiles`
  - 块文件路径为 `knownBoard/<x>_<y>_<s>.json`
  - `agent.json`、`homeLocations.json`、`unminedEthTxs/<hash>.json`

`WorldLocation` 使用现有 `@df/types` 的 `{ coords: { x: number; y: number }; hash: string; perlin: number; biomebase: number }`。

- [ ] **Step 1: Write the failing test**

```ts
it("round-trips the private map without a private key", () => {
  const files = serializeGameSave({
    agent: { address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" },
    chunks: [{ x: 0, y: 0, s: 16, l: [], p: 10 }],
    homeLocations: [],
    pendingTxs: [],
  });

  expect(files.has("skey")).toBe(false);
  expect(JSON.parse(files.get("agent.json")!).address).toBe(
    "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
  );
  expect(files.get("knownBoard/0_0_16.json")).toContain('"s":16');

  const loaded = parseGameSave(files);
  expect(loaded.chunks).toEqual([{ x: 0, y: 0, s: 16, l: [], p: 10 }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter client exec vitest run src/Backend/Save/GameSave.test.ts`
Expected: FAIL，`serializeGameSave` 未定义。

- [ ] **Step 3: Write minimal implementation**

`serializeGameSave` 写入 `agent.json`、`homeLocations.json`、每个块一个 `knownBoard` 文件、每笔待确认交易一个 `unminedEthTxs` 文件。`parseGameSave` 读回这些键。对象上不得出现 `privateKey` 字段；测试断言没有 `skey` 键。

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter client exec vitest run src/Backend/Save/GameSave.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/Backend/Save/GameSave.ts packages/client/src/Backend/Save/GameSave.test.ts
git commit -m "feat: serialize a wallet save as files"
```

---

### Task 3: 追加块时忽略半行并合并重复块

**Files:**

- Modify: `packages/client/src/Backend/Save/GameSave.ts`
- Modify: `packages/client/src/Backend/Save/GameSave.test.ts`

**Interfaces:**

- Consumes: `serializeGameSave`、`parseGameSave`
- Produces: `appendChunk(files: Map<string, string>, chunk: PersistedChunk): Map<string, string>`

同一 `x,y,s` 再次追加时替换该文件，不增加第二份。调用方每次写完一个完整 JSON 文件，所以半行只可能出现在调用方直接拼接的日志里。本任务同时提供 `parseJsonLines(text: string): unknown[]`，丢掉最后一行解析失败的内容，供以后的动作日志使用。

- [ ] **Step 1: Write the failing test**

```ts
it("replaces a chunk with the same footprint", () => {
  let files = serializeGameSave({
    agent: { address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" },
    chunks: [{ x: 1, y: 2, s: 16, l: [], p: 1 }],
    homeLocations: [],
    pendingTxs: [],
  });
  files = appendChunk(files, { x: 1, y: 2, s: 16, l: [], p: 9 });
  expect(parseGameSave(files).chunks).toEqual([
    { x: 1, y: 2, s: 16, l: [], p: 9 },
  ]);
});

it("drops a torn trailing json line", () => {
  expect(parseJsonLines('{"ok":1}\n{"torn":')).toEqual([{ ok: 1 }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter client exec vitest run src/Backend/Save/GameSave.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

`appendChunk` 用 `knownBoard/${chunk.x}_${chunk.y}_${chunk.s}.json` 覆盖。`parseJsonLines` 按换行拆开，`JSON.parse` 失败的行跳过。

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter client exec vitest run src/Backend/Save/GameSave.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/Backend/Save/GameSave.ts packages/client/src/Backend/Save/GameSave.test.ts
git commit -m "feat: append chunks idempotently and ignore torn lines"
```

---

### Task 4: 页面从目录读出钱包地址和块

**Files:**

- Create: `packages/client/src/Backend/Save/FileChunkSource.ts`
- Create: `packages/client/src/Backend/Save/FileChunkSource.test.ts`

**Interfaces:**

- Consumes: `parseGameSave`
- Produces:
  - `type DirectoryReader = { list(): Promise<string[]>; read(path: string): Promise<string> }`
  - `loadWalletSave(reader: DirectoryReader): Promise<GameSaveFiles>`

浏览器的 `FileSystemDirectoryHandle` 在页面里包成 `DirectoryReader`。测试用内存版，不碰真实磁盘。

- [ ] **Step 1: Write the failing test**

```ts
it("loads the agent address and chunks from a directory reader", async () => {
  const files = serializeGameSave({
    agent: { address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" },
    chunks: [{ x: 0, y: 0, s: 16, l: [], p: 3 }],
    homeLocations: [],
    pendingTxs: [],
  });
  const reader = {
    list: async () => [...files.keys()],
    read: async (path: string) => files.get(path) ?? "",
  };
  const save = await loadWalletSave(reader);
  expect(save.agent.address).toBe("0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266");
  expect(save.chunks).toHaveLength(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter client exec vitest run src/Backend/Save/FileChunkSource.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

`loadWalletSave` 列出路径，读出正文，交给 `parseGameSave`。缺 `agent.json` 时抛 `Error("agent.json missing")`。

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter client exec vitest run src/Backend/Save/FileChunkSource.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/Backend/Save/FileChunkSource.ts packages/client/src/Backend/Save/FileChunkSource.test.ts
git commit -m "feat: load a wallet save from a directory reader"
```

---

### Task 5: 观看模式不挖矿

**Files:**

- Modify: `packages/client/src/Backend/GameLogic/GameManagerFactory.ts` 约 636–640 行
- Modify: `packages/client/src/Frontend/Pages/RedPillLandingPage.tsx` 约 239–246 行、1056–1065 行

**Interfaces:**

- Consumes: `GameManagerFactory.create` 已有的 `spectate`
- Produces: `spectate === true` 时不调用 `initMiningManager`，也不调用 `addAccount({ x: innerRadius + 1, y: 0 })`

- [ ] **Step 1: Write the failing test**

在 `GameManagerFactory` 旁加一个纯函数，避免把整个工厂拉进测试：

```ts
export function shouldStartMiner(input: {
  watchOnly: boolean;
  hasHome: boolean;
  playerOnChain: boolean;
}): boolean {
  return !input.watchOnly && input.hasHome && input.playerOnChain;
}
```

测试：

```ts
expect(
  shouldStartMiner({ watchOnly: true, hasHome: true, playerOnChain: true }),
).toBe(false);
expect(
  shouldStartMiner({ watchOnly: false, hasHome: true, playerOnChain: true }),
).toBe(true);
```

放在 `packages/client/src/Backend/GameLogic/shouldStartMiner.test.ts`。

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter client exec vitest run src/Backend/GameLogic/shouldStartMiner.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

实现 `shouldStartMiner`。把 `GameManagerFactory.ts` 里：

```ts
if (!!homeLocation && initialState.players.has(account as string)) {
  gameManager.initMiningManager(homeLocation.coords);
}
```

改成：

```ts
if (
  shouldStartMiner({
    watchOnly: spectate,
    hasHome: !!homeLocation,
    playerOnChain: initialState.players.has(account as string),
  })
) {
  gameManager.initMiningManager(homeLocation.coords);
}
```

删除 `RedPillLandingPage.tsx` 里 `spectate` 分支对 `addAccount({ x: innerRadius + 1, y: 0 })` 的调用。观看模式在选中目录之前停在空地图，不写家坐标。

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter client exec vitest run src/Backend/GameLogic/shouldStartMiner.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/Backend/GameLogic/shouldStartMiner.ts packages/client/src/Backend/GameLogic/shouldStartMiner.test.ts packages/client/src/Backend/GameLogic/GameManagerFactory.ts packages/client/src/Frontend/Pages/RedPillLandingPage.tsx
git commit -m "fix: keep watch mode from mining a fake home"
```

---

### Task 6: 选择钱包目录后渲染

**Files:**

- Modify: `packages/client/src/Frontend/Pages/RedPillLandingPage.tsx`
- Modify: `packages/client/src/Backend/GameLogic/GameManagerFactory.ts` 约 127–149 行

**Interfaces:**

- Consumes: `loadWalletSave`、`showDirectoryPicker`
- Produces: 观看流程用 `agent.json` 的地址作为 `account`，用读到的 `chunks` 和 `homeLocations` 填充 `persistentChunkStore` 的内存视图，链上数据仍走现有 `gameStateDownloader.download`

- [ ] **Step 1: Write the failing test**

```ts
import { chunksToStoreRecords } from "../Save/FileChunkSource";

it("turns persisted chunks into store records keyed by footprint", () => {
  const records = chunksToStoreRecords([{ x: 4, y: 8, s: 16, l: [], p: 2 }]);
  expect(records.get("4,8,16")?.s).toBe(16);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter client exec vitest run src/Backend/Save/FileChunkSource.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

`chunksToStoreRecords` 返回 `Map<string, PersistedChunk>`。

`RedPillLandingPage` 在 `spectate` 进入游戏前调用 `showDirectoryPicker()`。用户取消则停留在「选择这一局的钱包目录」，不创建账户。选中后用 `FileSystemDirectoryHandle` 实现 `DirectoryReader`，`loadWalletSave`，把 `save.agent.address` 传给 `GameManagerFactory.create` 的 `mainAccount`。

`GameManagerFactory` 增加可选参数 `fileSave?: GameSaveFiles`。有该参数时：

- `account` 用 `fileSave.agent.address`，不用 `0x000…0001`，也不读 `mud:burnerWallet`。
- 不调用 `PersistentChunkStore.create`。
- 构造一个只含内存的 chunk store，预先 `addChunk` 文件里的块，`getHomeLocations` 返回文件里的家坐标。
- `getArtifactsInWallet(account)` 仍用这个地址。

没有 `fileSave` 的旧路径保持不动，供还没迁完的开发入口使用。观看入口必须传 `fileSave`。

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter client exec vitest run src/Backend/Save/FileChunkSource.test.ts src/Backend/GameLogic/shouldStartMiner.test.ts`
Expected: PASS

手动：打开 `http://localhost:3000/`，选择一个含 `agent.json` 和一块 `knownBoard` 的目录。页面画出该块，CPU 挖矿线程不启动。链上该地址没有星球时，块在、归属为空。

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/Backend/Save/FileChunkSource.ts packages/client/src/Backend/Save/FileChunkSource.test.ts packages/client/src/Backend/GameLogic/GameManagerFactory.ts packages/client/src/Frontend/Pages/RedPillLandingPage.tsx
git commit -m "feat: render a wallet folder without a local key"
```

---

### Task 7: agent 为当前钱包创建或复用目录

**Files:**

- Create: `packages/client/src/agent/createGameFolder.ts`
- Create: `packages/client/src/agent/createGameFolder.test.ts`

**Interfaces:**

- Consumes: `walletFolderName`、`serializeGameSave`
- Produces:

  - `type FolderWriter = { exists(path: string): Promise<boolean>; writeNew(path: string, body: string): Promise<void> }`
  - `ensureWalletFolder(writer: FolderWriter, ref: WalletSaveRef): Promise<"created" | "reused">`
  - 已存在 `agent.json` 时返回 `"reused"` 且不再写
  - 不存在时写入 `agent.json`，地址为小写

- [ ] **Step 1: Write the failing test**

```ts
it("creates a folder once for the connected wallet", async () => {
  const written = new Map<string, string>();
  const writer = {
    exists: async (path: string) => written.has(path),
    writeNew: async (path: string, body: string) => {
      written.set(path, body);
    },
  };
  const ref = {
    game: {
      chainId: 31337,
      world: "0xbe09885633Df7DfEfB96517cd6547fd4516A2907",
      season: 1,
    },
    wallet: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  };
  expect(await ensureWalletFolder(writer, ref)).toBe("created");
  expect(await ensureWalletFolder(writer, ref)).toBe("reused");
  expect(written.size).toBe(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter client exec vitest run src/agent/createGameFolder.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

`ensureWalletFolder` 检查 `<walletFolderName>/agent.json`。没有则 `writeNew` 一份 `serializeGameSave` 产生的 `agent.json`。

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter client exec vitest run src/agent/createGameFolder.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/agent/createGameFolder.ts packages/client/src/agent/createGameFolder.test.ts
git commit -m "feat: create one save folder per wallet in a season"
```

---

### Task 8: 写下 agent 的加入顺序

**Files:**

- Create: `docs/agent-game-skill.md`

**Interfaces:**

- Consumes: `ensureWalletFolder`、`GamePassNFT.buyPass`、`GamePassNFT.joinSeason`、`PlayerSystem._requireGamePass`
- Produces: agent 可执行的顺序，不含第二份哈希实现

- [ ] **Step 1: Write the skill doc with this sequence**

1. 向主人确认存档根目录，默认 `~/Library/Application Support/darkforest-punk/`。之后不再问。
2. 读取 agent 当前连接的钱包地址。这是 `msg.sender`，也是目录名。
3. 读取管理员已经设置的 `GamePassNFT.activeWorld()` 和 `activeSeason()`。赛季没开就停止。
4. 该地址已有通行证则跳过 `buyPass`。否则用该钱包调用 `buyPass()`。
5. 该地址尚未 `isPlayerInActiveSeason` 时，用该钱包的通行证调用 `joinSeason(tokenId)`。
6. 调用 `ensureWalletFolder`。返回 `reused` 就继续用原目录。
7. 挖矿、证明、发交易在后续任务接入现有 `miner.worker.ts` 和 `SnarkArgsHelper.ts`。每挖到一块，追加 `knownBoard/<x>_<y>_<s>.json`。准备发交易时先写 `unminedEthTxs/<hash>.json`，链上失败则删掉该文件。
8. 另一个钱包或另一局从第 2 步重新做，目录不同。

- [ ] **Step 2: Check the doc names the contracts that already exist**

`buyPass` 与 `joinSeason` 在 `packages/contracts/src/tokens/GamePassNFT.sol`。出生前的通行证检查在 `packages/contracts/src/systems/PlayerSystem.sol` 的 `_requireGamePass`。

- [ ] **Step 3: Commit**

```bash
git add docs/agent-game-skill.md
git commit -m "docs: describe how an agent joins a season and writes a save"
```

---

## 本计划故意不做的事

- 不改 `packages/client/src/Shared/network/TxExecutor.ts` 的 EIP-1559 转换。页面不签名。
- 不把挖矿哈希重写进 skill。下一步单独把 `miner.worker.ts` 接到 `appendChunk`。
- 不删除 IndexedDB 实现，直到 Task 6 的手动观看通过。
- 不把通行证购买的代币从 AIPRO 改成别的。`df.config.toml` 里 `game_pass.payment_token_address` 仍是零地址时，本地部署会用测试币；主网通行证地址由管理员配置。

## Self-review

- 管理员开局、钱包买通行证再加入、一局套一个钱包目录、页面只读、链上数据用地址读取：Task 1、2、6、7、8。
- 不存私钥：Task 2 的测试锁住。
- 不自动挖矿：Task 5。
- 重复加入不新建目录、重复块不拆成两份、半行丢弃：Task 3、7。
- 挖矿循环和 Groth16 没有实现任务，只在 Task 8 指到现有文件。这是下一份计划的全部范围。
