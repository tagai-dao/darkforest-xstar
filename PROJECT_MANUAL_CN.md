# Darkforest Punk 项目说明书

本文档从代码出发解读 `darkforest-punk`。项目自述把它称为 “Dark Forest MUD”，即用 Lattice MUD 重写/扩展 Dark Forest 的社区版本。代码中的核心事实是：游戏世界状态主要保存在链上 MUD Store 中，客户端负责探索、渲染、证明生成和交易编排；玩家行为通过 World 合约上的 `df__*` 系统调用改变世界状态。

## 1. 项目定位

`darkforest-punk` 是一个全链上不完全信息太空策略游戏。

从第一性原理看，它要解决三个问题：

1. 如何让所有关键资产和胜负状态可验证：使用 MUD 表保存玩家、星球、移动、神器、公会、资源、分数等状态。
2. 如何隐藏地图坐标但允许链上验证动作合法：使用 MiMC 哈希、Perlin 噪声和 Groth16 SNARK 证明，让合约只看到星球哈希、噪声值、距离等公开信号。
3. 如何让复杂 RTS/4X 体验可玩：客户端本地挖矿探索地图、缓存已知区域，链上仅在注册、出生、移动、升级、发现神器、提款等关键动作时结算。

## 2. 技术栈

### 合约层

- Solidity `>=0.8.24`
- Foundry
- Lattice MUD `@latticexyz/* 2.2.23`
- MUD World namespace：`df`
- MUD Store 表驱动状态模型
- World System 驱动动作模型
- Groth16 验证器内嵌在 `VerifySystem.sol`
- ERC721 神器 NFT：`ArtifactNFT.sol`

### 客户端层

- React 18
- Vite 6
- TypeScript
- viem、wagmi、RainbowKit
- MUD `syncToRecs` 同步链上表到 RECS 组件
- Zustand/RECS 辅助状态
- IndexedDB 本地缓存已探索 chunk、插件、未确认交易等
- Web Worker 本地挖矿探索地图
- snarkjs + WASM/zkey 在浏览器生成证明
- WebGL 自研渲染器绘制星空、星球、航线、区域、特效

### 包结构

- `packages/contracts`：MUD 配置、Solidity systems、libraries、tests、部署脚本。
- `packages/client`：游戏客户端、MUD 同步、Dark Forest 旧架构兼容层、WebGL 渲染、矿工、插件、钱包与 UI。
- `packages/client/src/Shared/snarks`：前端证明电路产物，包括 `init`、`move`、`reveal`、`biomebase`、`whitelist` 的 `.wasm/.zkey/.r1cs`。

## 3. 世界模型

项目把游戏世界拆成“表 + 系统 + 库”：

- 表定义在 `packages/contracts/mud.config.ts`。
- 行为入口是 `packages/contracts/src/systems/*.sol`。
- 复杂计算放在 `packages/contracts/src/lib/*.sol`。

核心实体如下。

### 玩家

`Player` 表保存：

- `owner`：主钱包。
- `burner`：游戏操作钱包。
- `index`：注册序号。
- `createdAt`：注册时间。
- `name`：玩家名。

辅助表：

- `BurnerToPlayer`：burner 到主玩家地址映射。
- `NameToPlayer`：名称哈希到玩家地址映射。
- `SpawnPlanet`：玩家出生星球。
- `PlayerScore`：玩家分数。
- `PlayerWithdrawSilver`、`PlayerWithdrawMaterial`：已提现资源统计。

`PlayerSystem.registerPlayer` 要求玩家未注册、名称未占用、burner 未占用且人数未超过 `TempConfigSet.playerLimit`。`spawnPlayer` 要求 SNARK 出生证明有效，玩家已注册且未出生。

### 星球

星球不是预先全部写入链上，而是惰性生成。首次读取某个 `planetHash` 时，`PlanetLib.readFromStore` 会检查 `PlanetConstants` 是否存在；不存在则根据哈希、Perlin、距离等参数初始化星球常量。

关键表：

- `PlanetConstants`：`perlin`、`level`、`planetType`、`spaceType`。
- `Planet`：`lastUpdateTick`、`population`、`silver`、升级状态、是否使用自定义属性。
- `PlanetProps`：升级或效果后的实际属性。
- `PlanetMetadata`：按空间类型、星球类型、等级配置基础属性。
- `PlanetInitialResource`：初始人口和银矿。
- `PlanetOwner`：星球拥有者。
- `PlanetFlags`：探索、神器占用、毁灭等标志。
- `PlanetArtifact`：每个星球最多 8 个神器。
- `PendingMove`、`Move`：飞行中的舰队队列。

星球类型在合约枚举中是：

- `PLANET`：普通可升级星球。
- `ASTEROID_FIELD`：材料产地。
- `FOUNDRY`：神器发现地点，客户端旧命名为 Ruins。
- `SPACETIME_RIP`：资源提现/计分地点，客户端旧命名为 Trading Post。
- `QUASAR`：特殊星球，移动距离减半，人口有上限截断。

空间类型：

- `NEBULA`
- `SPACE`
- `DEEP_SPACE`
- `DEAD_SPACE`

生物群系/材料由 `Biome` 和 `MaterialType` 枚举表达。Dead Space 会生成 `CORRUPTED` 生物群系。

### 宇宙与地图生成

地图生成从三个输入出发：

1. 坐标 `(x, y)`。
2. MiMC 哈希得到 `planetHash`。
3. Perlin 噪声得到空间类型、生物群系等。

合约不会直接知道隐藏坐标。客户端用 SNARK 证明公开信号确实来自某组私有坐标。

星球生成逻辑：

- `_validateHash`：`planetHash` 必须小于 SNARK scalar field 除以 `UniverseConfig.sparsity`，稀疏度越大，星球越少。
- `_initZone`：按 `UniverseZoneConfig.borders` 和距离平方决定宇宙区域。
- `_initSpaceType`：按 Perlin 阈值决定空间类型，特殊边界区域会强制是 `NEBULA`。
- `_initLevel`：取 `uint24(planetHash)`，按 `PlanetLevelConfig.thresholds` 映射等级，再叠加空间类型和宇宙区域 bonus/limit。
- `_initPlanetType`：取哈希中的另一段随机数，按 `PlanetTypeConfig` 概率分配星球类型。
- `_luckilyDouble`：用哈希字节给人口上限、增长、范围、速度、防御提供小概率翻倍 bonus。

## 4. 时间与增长

`Ticker` 表保存：

- `tickNumber`
- `tickRate`
- `timestamp`
- `paused`

每个会改变世界的系统通常先调用 `DFUtils.tick(world)`。`TickSystem.tick` 根据真实时间和 `tickRate` 推进逻辑 tick。全局更新目前主要是 `InnerCircle` 收缩。

星球本身按需同步：

1. `PlanetReadSystem.readPlanet` 读取星球。
2. `_syncTo` 依次弹出已到达舰队。
3. 每次到达前先自然增长到到达 tick。
4. 卸载舰队的人口、银、神器、材料。
5. 最后增长到当前 tick。

人口增长使用 logistic 曲线；银矿是线性增长到上限；材料只在 `ASTEROID_FIELD` 上增长。

## 5. 移动与战斗

移动入口是 `MoveSystem.move`。

流程：

1. 更新全局 `moveCount` 和玩家 `moveCount`。
2. 推进 tick。
3. 验证 SNARK 移动证明。
4. 读取出发星球和目标星球。
5. 如果目标已有不同 owner，则统计一次攻击。
6. 触发 `beforeMove` 效果。
7. 创建舰队，装载人口、银、神器、材料。
8. 计算距离和到达 tick。
9. 把舰队写入目标星球的 `PendingMove` 队列。
10. 触发 `afterMove` 效果并写回星球。

移动损耗公式在 `MoveLib.loadPopulation`：

- 实际到达人口约等于 `population / 2^(distance / range) - populationCap / 20`。
- 如果到达人口小于固定损耗，交易回滚。
- 这意味着远征需要高 range、大兵力，或者使用距离增益策略。

战斗在到达时结算：

- 如果舰队 captain 与目标 owner 相同，或两者在同一公会，则补充人口。
- 否则目标防御将抵消进攻人口。
- 若防守人口足够，则目标人口减少。
- 若进攻成功，则目标 owner 改为 captain，剩余进攻人口成为驻军，至少为 1。

项目新增了 `revertMove`：

- 只有 move captain 可以撤回。
- 只能在航程前半段撤回。
- 返航人口、银、材料都减半。
- 同一个 moveId 只能撤回一次。

策略含义：移动是核心风险资产转移。进攻方要计算距离损耗、防御系数、到达时间；防守方可在到达前支援或反制。撤回机制降低误操作和侦察失败成本，但只在前半程有效且有 50% 资源惩罚。

## 6. 升级系统

`PlanetUpgradeSystem.upgradePlanet` 支持一次交易升级多个分支：

- range
- speed
- defense

限制：

- 只有 owner 可升级。
- 目标必须是 `PLANET` 且等级大于 0。
- 单分支不能超过 `UpgradeConfig.maxSingleLevel`。
- 总等级不能超过该空间类型对应的上限。
- 花费是按当前总升级等级读取 `UpgradeConfig.silverCost` 中压缩的百分比，乘以星球 `silverCap`。

升级效果：

- 每升一级都会提高人口上限和人口增长。
- range 分支提升范围。
- speed 分支提升速度。
- defense 分支提升防御。

策略含义：升级不是单纯强化。range 影响能打多远，speed 影响窗口和支援速度，defense 影响守点成本。银矿是升级资源，因此早期扩张银矿、中期选择升级分支，是核心节奏。

## 7. 神器系统

神器是模块化系统。

基础表：

- `Artifact`：id、index、rarity、biome、status、chargeTick、activateTick、cooldownTick。
- `ArtifactOwner`：神器所在星球。
- `ArtifactConfig`：按稀有度配置神器类型概率。
- `ArtifactRegistry`：已安装神器类型。
- `ArtifactNFT`：链外/钱包持有神器 NFT 的入口。

每个星球最多 8 个神器。神器状态：

- `DEFAULT`
- `COOLDOWN`
- `CHARGING`
- `READY`
- `ACTIVE`
- `BROKEN`

发现流程：

1. 玩家占领 `FOUNDRY`。
2. 调用 `prospectPlanet`，记录当前 block。
3. 在 256 个区块窗口内调用 `findingArtifact`。
4. 客户端生成 biomebase SNARK，合约验证。
5. 由星球、时间、prospected blockhash 生成随机种子。
6. 根据等级和随机 bonus 决定稀有度。
7. 根据 `ArtifactConfig` 概率决定神器类型。
8. 写入星球神器槽，并把星球标记为 `EXPLORED`。

模块目录 `packages/contracts/src/modules/atfs` 包含：

- `PhotoidCannon`
- `Wormhole`
- `BloomFilter`
- `PinkBomb`

这些模块通过 `ArtifactProxySystem` 和 install library 接入主世界。主合约通过 artifact index 映射到对应 namespace，再调用代理系统的 `charge`、`activate`、`shutdown`。

策略含义：Foundry 是高价值目标；神器是战术变化来源。玩家需要投入兵力占领、等待 prospect 窗口、生成证明并抢先完成发现。神器还受类型互斥 flag 限制，同类 offensive/defensive/productive 效果不能无限叠加。

## 8. 材料与 Space Junk

项目在传统 Dark Forest 资源外加入材料和 Space Junk。

### Space Junk

相关表：

- `JunkConfig`
- `PlanetJunkOwner`
- `PlanetAddJunkTick`
- `PlayerJunk`
- `PlayerJunkLimit`

`addJunk` 的作用是占用玩家 junk 容量并把星球标记为玩家的 junk 所有权。若星球是 `ASTEROID_FIELD`，首次 add junk 时会按生物群系初始化可增长材料。

限制：

- `SPACE_JUNK_ENABLED` 必须开启。
- 玩家必须是星球 owner。
- `playerJunk + planetLevelJunk <= playerJunkLimit`。
- 很多系统带 `requireSameOwnerAndJunkOwner`，即开启 Space Junk 后，星球 owner 必须等于 junk owner 才能升级、神器操作、提现等。

`clearJunk` 会移除 junk owner，若星球 owner 也是执行者，还会把星球 owner 清空。

`buyJunk` 允许玩家扩容 junk limit，价格先线性后平方增长。

### 材料

材料表：

- `PlanetMaterialStorage`：bitmap，表示星球拥有哪些材料。
- `PlanetMaterial`：具体材料数量。
- `PlanetMaterialGrowth`：该材料是否增长。
- `MoveMaterial`：舰队携带材料。
- `PlayerWithdrawMaterial`：玩家已提现材料。

材料来源：

- `ASTEROID_FIELD` 被 add junk 后，按 biome 初始化对应材料。
- 材料增长率目前复用星球 `silverGrowth`。
- 材料上限目前复用 `silverCap`。

材料可通过移动运输，撤回时材料减半。

策略含义：Space Junk 是扩张上限和占地成本系统，抑制无限铺图；材料把 Asteroid Field 变成资源点，并通过 Spacetime Rip 转化为分数。玩家需要在“占点成本、运输风险、提现效率”之间权衡。

## 9. 资源提现与计分

`PlanetWithdrawSilverSystem.withdrawSilver`：

- 只能在 `SPACETIME_RIP` 上执行。
- 执行者必须是 owner。
- 银不足则失败。
- 提现金额不能太低：`silverCap <= silverToWithdraw * 5`，即至少接近容量的 20%。
- 提现金额加入玩家 `PlayerScore`。
- 如果玩家在公会中，也加入公会 `silver`。

`WithdrawMaterialSystem.withdrawMaterial` 类似，但按材料类型给分数倍率：

- `CORRUPTED_CRYSTAL` 最高。
- `BLACKALLOY` 次之。
- `PYROSTEEL`、`SCRAPIUM`、`CRYOSTONE` 等递减。

注意：代码中部分注释称 6x/4x/3x，但实际 `scorePoints = materialToWithdraw * scoreMultiplier`，没有除以 100 或 10。因此实际倍率按整数 600、400、300 等计算。这是一个需要项目方确认的经济参数风险点。

策略含义：Spacetime Rip 是终局计分/出货口。玩家不仅要采矿，还要能安全运输到 Rip，并在足够高容量时提现。高价值材料来自深层/危险生物群系，风险和收益更高。

## 10. 公会系统

公会表：

- `GuildConfig`：创建费、最大成员数、冷却 tick。
- `Guild`：状态、rank、成员数、registry、owner、silver。
- `GuildName`
- `GuildMember`
- `GuildHistory`
- `GuildCandidate`

功能：

- 创建公会需要注册且支付 `createFee`。
- 邀请、申请、批准、离开、踢人、转让 leader。
- 成员角色：`MEMBER`、`OFFICER`、`LEADER`。
- 公会成员之间舰队到达同一星球时按友军处理，不触发战斗。
- 玩家提现银/材料会同步累计到公会分数。

策略含义：公会不只是社交层，也影响战斗归属和分数结算。同盟运输、前线支援、资源集中提现都会放大组织优势。

## 11. 客户端架构

客户端不是简单 UI，而是一个本地游戏引擎。

### MUD 同步

`packages/client/src/mud/setupNetwork.ts`：

- 读取网络配置。
- 创建 viem public client。
- 用 `syncToRecs` 从 MUD indexer 或 RPC 同步链上表。
- 创建 burner wallet client。
- 创建 `worldContract`，提供 `df__*` 调用。

`createSystemCalls.ts` 封装了注册、出生、移动、暂停、tick、读星球、验证证明、撤回移动、提款等直接 MUD 调用。

### Dark Forest 兼容游戏层

`GameManagerFactory`：

- 创建 `ContractsAPI`。
- 下载初始链上状态。
- 从 IndexedDB 载入本地探索 chunk。
- 合并链上星球、已知神器、玩家、移动队列。
- 构建 `SnarkArgsHelper`。
- 创建 `GameManager`。

`GameManager`：

- 维护游戏主流程、交易意图、客户端校验、通知。
- 调用 `snarkHelper` 生成证明。
- 调用 `contractsAPI.submitTransaction` 提交链上交易。
- 处理移动、发现神器、广播坐标、提现、add junk、公会等复杂交互。

`GameObjects`：

- 维护客户端可见的星球、神器、到达舰队、坐标映射、揭示坐标、公会相关状态。
- 使用事件通知 UI 更新。

### 本地挖矿

`MinerManager` 使用 Web Worker 在客户端搜索 chunk：

- 根据世界半径、inner circle、Perlin 配置筛选可探索区域。
- Worker 返回 chunk 中的 `planetLocations`。
- 已探索 chunk 写入 IndexedDB。
- 出生搜索使用 `HomePlanetMinerChunkStore`，只探索满足出生 Perlin 区间的区域。

这意味着“探索”本质是本地计算哈希空间，找出满足星球稀疏度条件的位置；链上只在玩家真正操作该星球时验证。

### SNARK 生成

`SnarkArgsHelper` 支持：

- `getInitArgs`：出生证明。
- `getMoveArgs`：移动证明，并带 LRU 缓存。
- `getRevealArgs`：公开坐标证明。
- `getFindArtifactArgs`：生物群系证明。

它从 `Shared/snarks` 加载 WASM 和 zkey，用 `window.snarkjs.groth16.fullProve` 生成证明，再转成合约调用参数。

## 12. 游戏策略说明

### 早期

目标是快速出生、探索、占领低风险资源点。

建议策略：

- 优先用本地 miner 扩大视野，找近距离、可承受损耗的星球。
- 出生点固定在 `NEBULA`、level 0、`PLANET`，初始人口为 50000。
- 早期不要盲目远征，因为移动有 `population / 2^(distance/range)` 衰减和固定损耗。
- 优先占领能产银或能作为跳板的星球。

### 中期

目标是形成运输网络、升级核心星球、争夺 Foundry 和 Asteroid Field。

策略重点：

- Range 星球负责扩张半径。
- Speed 星球负责支援和抢点。
- Defense 星球负责前线和资源节点防守。
- Foundry 用于神器发现，但需要 prospect 后在窗口内 find。
- Asteroid Field 需要 add junk 才能激活材料经济。
- Space Junk 容量限制扩张规模，扩容成本会上升，不能无脑全占。

### 后期

目标是把银和材料运到 `SPACETIME_RIP` 提现计分，并通过神器、公会、撤回机制控制风险。

策略重点：

- 抢占 Rip 周围交通线。
- 高价值材料优先运输，但也更容易成为目标。
- 公会成员之间可友军支援，适合多人分工：探索、采集、护航、提现。
- 对敌方运输线进行截击或占领中转星球。
- 远征前计算到达人口、防御、到达时间；不利时利用前半程撤回减少损失。

### 神器战术

神器模块意味着策略不只由数值决定。可用方向包括：

- Wormhole：改变距离/连接关系，提升运输和突袭效率。
- Cannon：远程攻击或特殊打击。
- BloomFilter：可能偏信息/过滤类效果。
- PinkBomb：定点毁灭/爆破类战术。

实际效果要以对应模块 `*System.sol` 为准，但总设计思路是：神器以模块化方式改变移动、到达、属性或星球状态，让地图控制出现非线性战术。

## 13. 链上安全与可信边界

链上可信：

- 注册、出生、移动、战斗、升级、神器、提现、分数、公会等最终状态。
- 坐标合法性通过 SNARK 验证。
- MUD 表可由 indexer/RPC 重建。

客户端可信但非权威：

- 已探索地图。
- UI 显示的局部状态。
- 本地缓存 chunk。
- 交易前的便捷校验。
- 策略插件。

隐私边界：

- 未 reveal 的坐标只在本地。
- 一旦 `revealLocation`，坐标进入 `RevealedPlanet` 表，所有人可见。
- 移动证明公开目标哈希、目标 Perlin、距离上界和目标距离平方；代码注释也指出 `toRadiusSquare` 会泄漏部分位置信息，未来可改为 inner circle 约束或把星球类型判断移入电路。

## 14. 可扩展点

项目的扩展方向已经体现在代码结构中：

- 新神器：通过 `modules/atfs` 增加 InstallLibrary、ProxySystem、元数据表。
- 新经济：增加材料、提现、分数规则。
- 新地图规则：调整 `UniverseConfig`、`SpaceTypeConfig`、`UniverseZoneConfig`、`PlanetTypeConfig`。
- 新 UI/插件：客户端有 embedded plugins 和插件编辑器。
- 新社交机制：公会系统已有角色、申请、邀请、冷却、分数聚合。

## 15. 主要风险与代码观察

1. 客户端旧 Dark Forest 命名与合约新枚举存在映射差异。例如客户端 `RUINS` 对应合约 `FOUNDRY`，`TRADING_POST` 对应合约 `SPACETIME_RIP`。开发时必须小心枚举偏移。
2. `createSystemCalls.ts` 中有些直接调用看起来仍是测试/旧接口形态，例如 `move` 组装的参数与当前合约 `move(Proof, MoveInput, uint256, uint256, uint256, MaterialMove[])` 不完全一致，而 `GameManager` 仍有 legacy calldata 编码路径。这是兼容层，需要重点测试真实交易路径。
3. `WithdrawMaterialSystem.getBiomeScoreMultiplier` 注释倍率与实际计算不一致，可能导致材料分数远超预期。
4. `GuildSystem._getLastGuildLeaveTick` 使用 `uint256 lastIndex` 后判断 `lastIndex < 0` 永远为 false，若数组边界场景处理不当，需要测试覆盖。
5. `MoveSystem.revertMove` 使用普通 mapping 记录 `revertedMoves`，该状态不在 MUD 表中，MUD indexer 不会天然同步这个 mapping；客户端若需要展示撤回状态，需要通过合约 read 或事件补充。
6. SNARK 输入仍公开 `toRadiusSquare`，会泄漏目标离中心距离平方。
7. Space Junk 开启后大量核心操作要求 owner 与 junkOwner 一致，如果 UI 没把这个状态解释清楚，玩家会遇到“拥有但不能操作”的体验问题。

## 16. 一句话总结

`darkforest-punk` 的设计本质是：用 MUD 把 Dark Forest 的不完全信息宇宙变成可组合的链上 ECS 世界，用 SNARK 保护坐标隐私，用本地矿工和 WebGL 客户端提供可玩性，再通过神器、材料、Space Junk、公会和提现分数把传统扩张战斗演化成更复杂的链上资源战争。
