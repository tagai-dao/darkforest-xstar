# 早期向中心推进

适用于本机 Dark Forest Anvil（chain 31337）上已经生成家园的钱包。每轮重新读取当前归属和舰队状态，自动决定出航、登记或等待。运行时只需指定钱包存档目录。

## 预览

在仓库根目录运行。把路径换成存有 `agent.json` 和 `knownBoard.ndjson` 的钱包目录。

```sh
node packages/client/scripts/early-center/early-center.mjs '<钱包存档目录>'
node packages/client/scripts/early-center/early-center.mjs '<钱包存档目录>' --simulate
```

加 `--simulate` 会为出航或登记生成 Groth16 证明，并用实际发件地址逐笔模拟。依赖前一笔成功的动作（如释放额度后登记）会标记为需要前置回执。两个命令都只读。需要仓库的客户端依赖和编译后的 World ABI（`packages/contracts/out/IWorld.sol/IWorld.json`）。

## 选路

- 从链上归属事件发现己方星球，合并链上公开坐标与钱包探图记录。用同一区块的 Ticker 和区块时间计算结算 tick，再用合约的 `df__readPlanetAt` 读取到期舰队和能量增长的结算结果。预览的 `holdings` 列出当前己方星球。缺少坐标的星球仍会显示，补齐坐标后才可作为发射点。
- 只打无主星球，过滤内圈尚未开放、已毁或有其他玩家舰队在途的目标。只要能打掉守军，就可以先派一支舰队削弱。后续轮次计入己方在途伤害，足够攻下时停止追加。预计攻下时才预留登记额度。
- 各级星球优先向上打。默认优先高一级。如果最近的高两级目标距离不超过最近的高一级目标的一半，优先跨两级。距离优先级相同时，再比较向中心推进的效果、下一跳和恢复时间。
- 按本次实际可发送兵力估算航程损耗。最近的合格更高级目标预计到达兵力低于出发量的 10% 时，才考虑同级或低一级。没有已知的合格更高级目标时等待探图。所有舰队最多向下一级，撤离也按同样的路线规则，签名前会复核链上等级。
- 同级舰队只能发往更靠近地图中心的星球，进攻、补给和撤离都要符合这条规则，签名前会复核。
- 满能量星球优先出航。离上限只差 1 个链上单位也视为满能量。若没有合规进攻路线，再考虑补给有容量的己方星球。等待中的满能量星球会列在 `fullWaiting`。
- 决定出航时使用快照已结算能量减 1 个链上单位。能生长的星球若因补给超过能量上限，按上限减 1 计算，避免排队期间超额能量衰减导致交易失败。快照有已经攻下且可继续推进的星球时，优先用 `addJunk` 登记。派出的舰队由后续轮次结算。下一跳是估算，需要届时重新读取。
- 同一轮可以安排多个发射点、多个登记，以及释放额度后继续攻占。每个发射点每轮最多派一支舰队，所有动作合计计算已分配的额度。执行时按计划顺序逐笔模拟、发出、等待回执。任一动作失败时停止剩余动作。

多个满能量星球可以在同一轮进攻同一个目标，合计足够攻下时停止追加。涉及遗迹效果或虫洞的路线不纳入搜索。探图覆盖不足时，预览可能没有可选航线。

## 垃圾额度不足

保留最内侧的前线星球。额度不足时，按离地图中心的距离从远到近选择可安全撤离的星球。撤离舰队带走快照中可发送的能量、白银和材料，送到有足够容量的内侧己方星球。能量照常扣除航程损耗。

只有后续快照确认撤离舰队到达、未被召回且接收星球仍归己方，才会调用 `clearJunk`。外侧候选还在撤离时，会等它完成再按顺序释放额度。有神器、没有合适接收点、运不走全部白银或材料的星球会保留。撤离后的自然增长量可能随星球留下。若外侧星球没有可运出的资源，可以直接放弃。额度够用后停止释放。

## 执行游戏操作

```sh
node packages/client/scripts/early-center/early-center-execute.mjs '<钱包存档目录>' --execute
node packages/client/scripts/early-center/early-center-execute.mjs '<钱包存档目录>' --watch
```

`--execute` 执行一轮。`--watch` 在本轮交易全部收到成功回执并写入记录后等待 3 秒，再开始下一轮。若本轮没有交易，则从检查结束时开始等。可以在 `--watch` 后指定其他等待秒数。终端提示输入本地测试钱包私钥时，输入不会回显，私钥只用于当前进程签名。已有内存签名器时，直接用下面的接口。

按 Ctrl+C 停止。签名前脚本会再次核对来源和目标的归属，以及目标是否已有待结算舰队。状态变动使计划失效时，会报错停止。

### 通过现有签名器执行

在持有临时钱包账号的 Node 运行时里，显式调用执行模块。账号需提供 `address` 和 viem 兼容的 `signTransaction`。每次调用执行一轮，只有成功回执才写入 `actions.ndjson`。

```js
const { executeEarlyCenterRound, runEarlyCenterStrategy } = await import(
  "./packages/client/scripts/early-center/early-center-execute.mjs"
);
const result = await executeEarlyCenterRound(walletSaveDir, inMemoryAccount);
// 连续运行时，可用 runEarlyCenterStrategy 代替上面的一轮调用。
// await runEarlyCenterStrategy(walletSaveDir, inMemoryAccount, { signal });
```

如果提交后出现超时或日志写入错误，先按报错里的交易哈希检查回执，再决定是否继续。
