import { MaterialType } from "@df/types";

import { getMaterialColor } from "../../Utils/materialColor";

export type DocRun = string | { text: string; color: string; detail?: string };

export type DocBlock =
  | { kind: "p"; text: string }
  | { kind: "rich"; parts: DocRun[] }
  | { kind: "link"; label: string; href: string }
  | { kind: "h2"; id: string; title: string }
  | { kind: "ul" | "ol"; items: string[] }
  | {
      kind: "table";
      headers: string[];
      rows: DocRun[][];
      numericColumns?: number[];
      comparison?: boolean;
    }
  | { kind: "contracts" }
  | { kind: "energy-figure" }
  | { kind: "space-figure" }
  | { kind: "biome-figure" };

/** 材料名用星球上同一种颜色。 */
function materialLabel(id: MaterialType, name: string): DocRun {
  return { text: name, color: getMaterialColor(id) };
}

export type DocChapter = {
  id: string;
  title: string;
  blocks: DocBlock[];
};

/** 配额的基础单价，单位是 0.001 BNB。与 df.config.toml 的 g_、j_ 一致，即 0.003 BNB。 */
const JUNK_BASE_PRICE_MILLI = 3;

/**
 * 配额档的累计价格，单位是 0.001 BNB。
 * 1 档免费；2 到 8 档每多一档加 1 个基础单价；9 档起在 7 个基础单价上加上 (档位 - 8)² 个基础单价。
 * 这和合约 getBuyJunkFee 的分段规则一致。
 */
function junkTierPriceMilli(tier: number): number {
  if (tier <= 1) {
    return 0;
  }
  if (tier <= 8) {
    return (tier - 1) * JUNK_BASE_PRICE_MILLI;
  }
  return (7 + (tier - 8) ** 2) * JUNK_BASE_PRICE_MILLI;
}

/** 文档里只列 20,000 额度以内的档位，也就是 1 到 20 档。 */
const JUNK_DOC_MAX_TIER = 20;

/** 配额价格表的每一行：档位、配额上限、累计价格、从上一档加多少钱。 */
const junkTierRows: DocRun[][] = Array.from(
  { length: JUNK_DOC_MAX_TIER },
  (_, index) => {
    const tier = index + 1;
    const total = junkTierPriceMilli(tier);
    const step = tier === 1 ? null : total - junkTierPriceMilli(tier - 1);
    return [
      String(tier),
      String(tier * 1000),
      (total / 1000).toFixed(3),
      step === null ? "—" : (step / 1000).toFixed(3),
    ];
  },
);

export const gameDocs: DocChapter[] = [
  {
    id: "overview",
    title: "概述",
    blocks: [
      {
        kind: "p",
        text: "Dark Forest Punk 是一款不完全信息的太空策略游戏。你在本地探索星图，通过 Agent 提交占领、航行、升级和提取等操作，由链上合约结算。",
      },
      { kind: "h2", id: "nature", title: "星图与链上状态" },
      {
        kind: "p",
        text: "链上记录已初始化星球的归属、资源和升级，以及舰队、配额、分数和入场 NFT 状态。合约以 tick 为时间单位，先结算到期舰队和资源成长，再检查并执行玩家操作。",
      },
      {
        kind: "p",
        text: "星图由本地探索结果和其他玩家已揭示的坐标组成。你可以用零知识证明提交操作，星球坐标在执行揭示后才公开。",
      },
      { kind: "h2", id: "goal", title: "目标" },
      {
        kind: "p",
        text: "从母星出发占领星球，把银和材料运到时空裂隙提取。每次提取同步增加游戏分数和 Nutbox 矿池质押，玩家按质押份额领取 AIPRO。",
      },
      {
        kind: "ul",
        items: [
          "能量用于派遣舰队和占领星球。通常星球等级越高，舰队能飞得越远。",
          "小行星带生产银和材料。",
          "配额决定钱包能同时登记多少星球。",
        ],
      },
      { kind: "h2", id: "round", title: "玩法流程" },
      {
        kind: "ol",
        items: [
          "登录并入场。用 Agent 登录 Binance Agentic Wallet，再质押一枚 Game Pass NFT。",
          "建立母星。在区域 4 的星云初始化一颗 0 级星球。",
          "探索星图。让 Agent 从母星向外探索，将发现的坐标保存到本地钱包目录。",
          "占领与发展。派舰队占领星球，登记配额，再用获取的银升级行星。",
          "运输与提取。在小行星带积攒银和材料，运往已登记的己方时空裂隙提取。",
          "领取奖励。按在矿池中的质押份额领取 AIPRO。",
        ],
      },
      { kind: "h2", id: "contracts", title: "相关合约" },
      { kind: "contracts" },
      { kind: "h2", id: "wallet-login", title: "登录 Binance Agentic Wallet" },
      {
        kind: "p",
        text: "在 Agent 中安装 Binance 官方 Agentic Wallet 技能，并使用支持 BNB Smart Chain（BSC，链 ID 56）的 Agentic Wallet。开始登录前，可以让 Agent 用 baw wallet status --json 检查是否已连接。",
      },
      {
        kind: "link",
        label: "Binance 官方技能安装说明",
        href: "https://developers.binance.com/en/docs/products/agentic-wallet/welcome",
      },
      {
        kind: "ol",
        items: [
          "发起登录。让 Agent 运行 baw auth signin --json，显示 pairingCode，并打开返回的完整 urlForWeb。",
          "在 Binance App 确认。使用 App 扫描 Binance 官方登录页的二维码，核对 App 上的配对码与 Agent 给出的一致后确认。",
          "等待验证。Agent 用返回的 qrCodeId 运行 baw auth verify --qrCodeId <qrCodeId> --json，等到 App 完成确认。二维码过期时重新发起登录。",
          "检查钱包。让 Agent 再用 baw wallet status --json 确认状态为 CONNECTED，并核对 BSC 钱包地址和 Binance Handle。然后回游戏首页发送开局指令。",
        ],
      },
      {
        kind: "link",
        label: "Binance 官方登录说明",
        href: "https://github.com/binance/binance-skills-hub/blob/main/skills/binance-web3/binance-agentic-wallet/references/authentication.md",
      },
      { kind: "h2", id: "entry", title: "入场" },
      {
        kind: "p",
        text: "每局使用独立的世界、矿池和地图密钥。已绑定 Binance Handle 的钱包可存入一枚 Game Pass NFT，并可随时取回。首页可查看单枚铸造价并复制购买指令。",
      },
      {
        kind: "p",
        text: "注册、航行、升级、提取、买银、配额、揭示、神器、公会和 GPT 代币等操作要求 NFT 处于保管状态。取回后仍可查看数据和领取矿池奖励，已出发的舰队照常到达。星球、分数和质押继续归原钱包，再存入即可恢复操作。",
      },
    ],
  },
  {
    id: "produce",
    title: "产出",
    blocks: [
      {
        kind: "p",
        text: "游戏界面中的能量、银和分数均为链上数值 ÷ 1000。文档中的属性上限与成长数据使用链上单位。",
      },
      { kind: "h2", id: "energy", title: "能量" },
      {
        kind: "p",
        text: "能量用来占领。它在行星（Planet）和铸造厂（Foundry）上成长，不能提取成分数。成长曲线写在「资源」的「能量曲线」。",
      },
      { kind: "h2", id: "silver", title: "银" },
      {
        kind: "p",
        text: "小行星带生产银。你也可以在符合条件的星球买银，再用舰队运输。每提取 1 单位银，玩家分数和 Nutbox 质押各增加 1 单位。",
      },
      { kind: "h2", id: "materials", title: "材料" },
      {
        kind: "p",
        text: "材料仅由小行星带产出。在时空裂隙提取时，分数和质押各增加「材料数量 × 倍率」。各材料倍率见「资源」。",
      },
      { kind: "h2", id: "aipro", title: "AIPRO" },
      {
        kind: "p",
        text: "买银支付的 AIPRO 按设定比例销毁，其余注入矿池，按质押份额分配。领取 AIPRO 后，钱包的质押份额保持有效。",
      },
    ],
  },
  {
    id: "time",
    title: "时间",
    blocks: [
      { kind: "h2", id: "tick", title: "时钟与结算" },
      {
        kind: "p",
        text: "tickRate 表示每秒推进的 tick 数。各局速率可能不同，以当前世界的 tickRate、tickNumber、timestamp 和 paused 为准。",
      },
      {
        kind: "p",
        text: "游戏运行时，每次调用补进的 tick 为「当前区块时间戳 − 上次结算时间戳」× tickRate。舰队到达、召回窗口和资源成长都按 tick 计算。",
      },
      {
        kind: "p",
        text: "秒数 = tick 数 ÷ tickRate。例如速率为 2 时，100 tick 等于 50 秒。速率为 0 或 paused 为真时，时钟停止推进。",
      },
      {
        kind: "p",
        text: "tickNumber 是最近一次写回的时钟值。是否暂停以 paused 为准。",
      },
      { kind: "h2", id: "paused", title: "暂停时" },
      {
        kind: "ul",
        items: [
          "舰队不到达，能量、银、材料不成长，内圈不收缩。",
          "移动仍可发出，但停在出发 tick 上。升级、垃圾和揭示也可以发。",
          "单独的推进时钟会失败。其他星球调用内部会尝试推进，暂停时这次写入不起作用。",
        ],
      },
      { kind: "h2", id: "settle", title: "先结算，再检查" },
      {
        kind: "p",
        text: "星球表保存的是上一次写入。时间过去本身不会改这些行。到期的舰队、长出来的能量和银、缩小后的内圈，都要等一次调用结算后才出现在表里。页面和本地星球文件显示的也是那一次写入。",
      },
      {
        kind: "ul",
        items: [
          "调用先把流逝的 tick 写入 tickNumber。结算到的 tick 是表里的 tickNumber 加上这次补上的 tick。",
          "然后装入星球，先应用到达 tick 不晚于这个新 tick 的舰队，再成长到这个 tick。此时的拥有者、能量和银是这个结果，不是表里刚读到的那一行。",
          "条件按这个结果检查。移动、升级、提取、揭示、买银和神器都是先结算再检查。",
          "最后把星球写回。下一次读表，才能看到新的拥有者。",
        ],
      },
      {
        kind: "p",
        text: "表里拥有者仍是空地址，只说明占领还没写上链。单独推进时钟只更新 tick 和内圈，不改星球那一行，所以读表仍会看到旧拥有者。登记垃圾才会把占领写进去。",
      },
      { kind: "h2", id: "circle", title: "内圈" },
      {
        kind: "p",
        text: "内圈从半径 75000 开始。时钟前进时，每个 tick 减少 0.087，到 0 为止。到 0 之后中心可以进入。分数保持原样，没有人因为内圈到 0 而收到奖励。",
      },
    ],
  },
  {
    id: "map",
    title: "地图",
    blocks: [
      {
        kind: "p",
        text: "地图是以原点为圆心、半径 100000 的圆盘。区域由到原点的直线距离决定。",
      },
      { kind: "h2", id: "zones", title: "区域" },
      {
        kind: "table",
        headers: ["距离", "区域", "等级加成", "区域等级上限"],
        rows: [
          ["小于 37,500", "0", "+1", "9"],
          ["37,500 至小于 50,000", "1", "0", "8"],
          ["50,000 至小于 62,500", "2", "0", "7"],
          ["62,500 至小于 75,000", "3", "0", "6"],
          ["75,000 至小于 87,500", "4", "0", "5"],
          ["87,500 及以上", "5", "0", "8"],
        ],
      },
      { kind: "h2", id: "space", title: "空间类型" },
      {
        kind: "p",
        text: "空间类型来自 perlin。区域 4 里的每颗星球都是星云。perlin 低于 14 是星云，低于 15 是太空，低于 19 是深空，19 及以上是死空。",
      },
      {
        kind: "p",
        text: "这一局的星球位置钥匙是 20261119，空间钥匙是 20261120，生物群钥匙是 20261121。噪声用空间钥匙、尺度 8192 计算，不沿坐标轴镜像。取整后大约落在 0 到 32，数值往中间堆，同一种空间连成大片。太空只对应整数 14。这一档正好是噪声最密的地方，所以太空在图上也是一片片区域。",
      },
      {
        kind: "p",
        text: "下图是一局半径 100000 的圆盘示例。原点在中心，上方为正。三条细圈从里到外是 37500、75000、87500。75000 到 87500 那一圈全部是星云，家出生在这里。这一圈的里面和外面，四种空间都成片出现。",
      },
      { kind: "space-figure" },
      {
        kind: "p",
        text: "下表为均匀采样估算的面积占比。全图统计包含星云出生带。",
      },
      {
        kind: "table",
        numericColumns: [1, 2],
        headers: ["空间", "全图", "75000 以内"],
        rows: [
          ["星云", "33.2%", "17.6%"],
          ["太空", "12.0%", "16.2%"],
          ["深空", "49.2%", "59.8%"],
          ["死空", "5.7%", "6.3%"],
        ],
      },
      { kind: "h2", id: "biomes", title: "生态" },
      {
        kind: "p",
        text: "生态是这个坐标的地形，和星球类型分开。行星、小行星带、铸造厂都可以落在同一种生态上。空间类型先圈定三种地形，再用生态噪声 biomebase 取一种。低于 15 是第一种，低于 17 是第二种，否则是第三种。死空固定是腐化。",
      },
      {
        kind: "p",
        text: "空间类型决定基础属性和等级上限，星球类型可进一步调整属性。生态决定画面、小行星带首次登记时的材料，以及铸造厂神器上的生态标记。",
      },
      { kind: "biome-figure" },
      { kind: "h2", id: "home", title: "家和内圈" },
      {
        kind: "p",
        text: "移动或出生的目的地如果比内圈更靠近原点，调用会失败。检查用的是这次调用结算之后的半径。开局半径 75000 时，区域 0 到 3 关闭，区域 4 和 5 开放。揭示不检查内圈。",
      },
      {
        kind: "p",
        text: "家只能出生在区域 4，并且只能是 0 级星球。那颗星球是星云。新钱包从被关掉的中心外面那一圈开始。",
      },
    ],
  },
  {
    id: "planets",
    title: "星球",
    blocks: [
      { kind: "h2", id: "types", title: "五种星球类型" },
      {
        kind: "p",
        text: "0 级星球均为行星。其余四种类型从 1 级起出现。",
      },
      {
        kind: "table",
        comparison: true,
        headers: ["星球类型", "主要用途", "关键规则"],
        rows: [
          [
            { text: "行星", detail: "Planet", color: "#a6d5ff" },
            "派遣舰队、升级",
            "自然恢复能量。只有 1 级及以上的行星可以升级。",
          ],
          [
            { text: "小行星带", detail: "Asteroid Field", color: "#f3cb86" },
            "生产银和材料",
            "银上限加倍，防御减半。银和材料共用一个产速，按空间修正后的原始银成长除以 5，再向下取整。初始银为银上限的 5%，首次登记发放等量材料。",
          ],
          [
            { text: "铸造厂", detail: "Foundry", color: "#f1a98d" },
            "勘探并发现神器",
            "基础属性与行星相同。勘探后需在 256 个区块内完成发现。",
          ],
          [
            { text: "时空裂隙", detail: "Spacetime Rip", color: "#8be0d3" },
            "提取银和材料，增加分数与质押",
            "可存取神器 NFT。银上限和防御与小行星带相同，无法购买银。",
          ],
          [
            { text: "类星体", detail: "Quasar", color: "#cdb7ff" },
            "缩短航程，适合中转",
            "飞往类星体时距离减半，从这里出发时速度加倍。超出上限的到达能量舍弃，能量不自然增长。",
          ],
        ],
      },
      {
        kind: "p",
        text: "小行星带每 tick 生产银，直至达到银上限。可在行星、小行星带、铸造厂和类星体购买银，买入后仍须低于或等于该星球的银上限。",
      },
      {
        kind: "p",
        text: "类型由行星哈希和空间分布决定。星云以行星为主，铸造厂只出现在太空、深空和死空。小行星带、时空裂隙和类星体在深空与死空更常见。",
      },
      { kind: "h2", id: "level", title: "等级" },
      {
        kind: "p",
        text: "基础等级由行星哈希的低 24 位决定。依次比较阈值 100、500、4000、8000、30000、65520、262128、1048561、4194292，首次低于哪个阈值，就对应 9 至 1 级。达到最后一个阈值或更高时为 0 级。",
      },
      {
        kind: "p",
        text: "区域 0 的星球额外加 1 级。最终等级取加成后等级、区域上限和空间上限中的最小值。星云、太空、深空、死空的等级上限依次为 4、5、9、9。只有区域 0 的深空和死空星球可达到 9 级。",
      },
      { kind: "h2", id: "nebula-stats", title: "星云基础属性" },
      {
        kind: "p",
        text: "下表列出各等级的基础值，实际属性还受空间和星球类型影响。小行星带的银和材料产速都是空间修正后原始银成长的 20%，按链上整数精度向下取整。",
      },
      {
        kind: "table",
        numericColumns: [0, 1, 2, 3, 4, 5, 6, 7],
        headers: [
          "级",
          "射程",
          "速度",
          "防御",
          "能量上限",
          "能量成长",
          "银上限",
          "银成长",
        ],
        rows: [
          ["0", "99", "160", "400", "100000", "417", "0", "0"],
          ["1", "177", "160", "400", "400000", "833", "100000", "56"],
          ["2", "315", "160", "300", "1600000", "1250", "500000", "167"],
          ["3", "591", "160", "300", "6000000", "1667", "2500000", "417"],
          ["4", "1025", "160", "300", "25000000", "2083", "12000000", "833"],
          ["5", "1734", "160", "200", "100000000", "2500", "50000000", "1667"],
          ["6", "2838", "160", "200", "300000000", "2917", "100000000", "2778"],
          ["7", "4414", "160", "200", "500000000", "3333", "200000000", "2778"],
          ["8", "6306", "160", "200", "700000000", "3750", "300000000", "2778"],
          ["9", "8829", "160", "200", "800000000", "4167", "400000000", "2778"],
        ],
      },
      {
        kind: "p",
        text: "空间加成以星云基础值为基准。每次计算使用整数除法。",
      },
      {
        kind: "table",
        numericColumns: [1, 2, 3],
        headers: ["空间", "射程、速度、资源上限及成长", "防御", "初始能量比例"],
        rows: [
          ["太空", "125%", "50%", "400%"],
          ["深空", "150%", "25%", "1000%"],
          ["死空", "200%", "15%", "2000%"],
        ],
      },
      { kind: "h2", id: "bonuses", title: "先天属性加成" },
      {
        kind: "p",
        text: "完成空间和星球类型调整后，哈希右移 32 位，再按下表顺序为每项属性读取一个字节。字节值小于 16 时，该项属性加倍。升级在加成之后结算。",
      },
      {
        kind: "table",
        numericColumns: [1],
        headers: ["属性", "加成"],
        rows: [
          ["能量上限", "200%"],
          ["能量成长", "200%"],
          ["射程", "200%"],
          ["速度", "200%"],
          ["防御", "200%"],
        ],
      },
      { kind: "h2", id: "prospect", title: "勘探和发现" },
      {
        kind: "p",
        text: "选中自己已登记的铸造厂，点击「复制获得神器」，将复制的指令发给 Agent。",
      },
      {
        kind: "p",
        text: "第一步是勘探。交易记录当前区块号，开启发现窗口。窗口内只需勘探一次，资源保持原值。",
      },
      {
        kind: "p",
        text: "第二步是发现。Agent 需在勘探区块到其后第 256 个区块之间提交零知识证明和生态基数。随机种子由星球哈希、发现区块的时间戳和勘探区块的哈希生成。",
      },
      {
        kind: "p",
        text: "发现成功后，铸造厂获得一件未充能的神器，并标记为已探索。每颗星球最多存放 8 件神器。稀有度由铸造厂等级决定，随机种子约有 1/16 的概率按高 1 级计算、1/64 的概率按高 2 级计算。神器类型按稀有度抽取，生态由空间类型和生态基数决定。",
      },
      {
        kind: "table",
        headers: ["铸造厂等级", "基础稀有度"],
        rows: [
          ["0–1", "普通"],
          ["2–3", "稀有"],
          ["4–5", "史诗"],
          ["6–7", "传说"],
          ["8–9", "神话"],
        ],
      },
      {
        kind: "p",
        text: "窗口到期仍未完成发现，可以重新勘探。每座铸造厂只能成功发现一次。",
      },
    ],
  },
  {
    id: "junk",
    title: "配额",
    blocks: [
      {
        kind: "p",
        text: "配额是登记和维持星球生产所需的容量。初始化后，钱包有 1000 点配额可用，母星也需要登记。",
      },
      { kind: "h2", id: "cost", title: "登记和清除" },
      {
        kind: "p",
        text: "登记一颗星球按等级消耗配额：0 到 9 级分别是 50、55、60、65、75、100、200、250、300、500。已用加上这次花费必须不超过上限。成功后这只钱包成为垃圾拥有者，上一个垃圾拥有者的已用减少同样的数量。小行星带（Asteroid Field）的第一次登记会初始化材料。",
      },
      {
        kind: "p",
        text: "清除垃圾退回这次花费。调用者必须是垃圾拥有者。如果这只钱包同时也拥有这颗星球，清除会把拥有者一并清成空地址，能量和银留下，任何人都可以再占领。清除别人拥有的星球，只退回配额。",
      },
      { kind: "h2", id: "same-owner", title: "拥有者和垃圾拥有者" },
      {
        kind: "p",
        text: "只有星球拥有者与垃圾拥有者一致时，星球才能生产资源、派遣舰队、升级、提取或买银。资源成长还要求时钟运行。",
      },
      {
        kind: "p",
        text: "占领星球只变更星球拥有者。新拥有者登记时，原登记人的配额才会释放，原登记人也可自行清除。",
      },
      { kind: "h2", id: "raise", title: "提高上限" },
      {
        kind: "p",
        text: "已登记的钱包可用 BNB 购买第 2 至第 1000 档配额。每档对应 1000 点上限，最高 1,000,000 点。",
      },
      {
        kind: "p",
        text: "升级档位只需支付两档的累计价差。超额支付的 BNB 不退款。下表列出 20,000 点以内的价格。",
      },
      {
        kind: "table",
        numericColumns: [0, 1, 2, 3],
        headers: ["档位", "配额上限", "累计价格（BNB）", "从上一档加价（BNB）"],
        rows: junkTierRows,
      },
    ],
  },
  {
    id: "voyage",
    title: "航行",
    blocks: [
      { kind: "h2", id: "attack", title: "航程与能量损耗" },
      {
        kind: "p",
        text: "以两颗星球的直线距离为基准。飞往类星体时距离减半，使用虫洞时再乘以「虫洞倍率 ÷ 1000」。",
      },
      {
        kind: "p",
        text: "出发星球至少保留 1 点链上能量。到达能量 = 派出能量 ÷ 2^(距离 ÷ 射程) − 能量上限 ÷ 20。射程和能量上限取自出发星球。到达能量须大于 0。",
      },
      {
        kind: "p",
        text: "旅行 tick 数是距离 × 100 / 速度，用出发星球的速度。出发 tick 是目的地的 lastUpdateTick。时钟暂停时这个 tick 不动，舰队也就不到达。",
      },
      { kind: "h2", id: "combat", title: "战斗" },
      {
        kind: "p",
        text: "攻击消耗防守方「到达能量 × 100 ÷ 防御」的能量。防御为 100 时，能量按一比一扣除。防御为 400 时，扣除四分之一。",
      },
      {
        kind: "p",
        text: "防守方能量耗尽时，进攻方占领星球，留下「到达能量 − 防守方原有能量 × 防御 ÷ 100」，至少保留 1 点。类星体按能量上限截断结果。",
      },
      {
        kind: "p",
        text: "己方或同一公会舰队的到达能量计为援军。舰队携带的银和材料入库，超出目的地上限的部分舍弃。战斗伤害只取决于到达能量和防御。",
      },
      { kind: "h2", id: "relay", title: "中转" },
      {
        kind: "p",
        text: "舰队飞到这只钱包已经占有的星球，是在那里集结。下一次航行从那颗星球出发，用的是它的射程和速度，不是产出能量的那颗。集结必须先到达，出发星球也必须已由这只钱包登记。两段航程比直飞更快的情况，是直飞到达时已经没有能量，或者前方星球更靠近目标、并且已经有产地没有的射程或速度。类星体（Quasar）把集结这一段的距离减半，离开时速度加倍，但会丢掉超过它能量上限的到达能量。",
      },
      {
        kind: "p",
        text: "没有主人的 0 级星球初始能量是 0，任何正数的到达能量都能占领。更高的空间类型提高初始能量百分比，所以深空或死空的星球即使防御更低，也可能已经有一支很大的驻军。",
      },
    ],
  },
  {
    id: "upgrade",
    title: "升级",
    blocks: [
      {
        kind: "p",
        text: "只有已登记的己方 1 级及以上行星可以升级。银从该星球扣除，费用随累计升级次数递增，依次为银上限的 20%、40%、60%、80%、100%。提交指令时填写射程、速度和防御各自增加的级数。",
      },
      { kind: "h2", id: "multipliers", title: "每一级的变化" },
      {
        kind: "ul",
        items: [
          "任意一项每升一级，能量上限和能量成长都变为原来的 120%（即提高 20%）。",
          "射程每级变为原来的 125%。速度每级变为原来的 175%。防御每级变为原来的 120%。",
          "单项停在 4 级。三项合计在星云停在 3，太空停在 4，深空或死空停在 5。",
        ],
      },
      {
        kind: "p",
        text: "升级后的属性用于后续航行与战斗。能量上限提高后，出发时的固定能量损耗也会增加。",
      },
    ],
  },
  {
    id: "resources",
    title: "资源",
    blocks: [
      { kind: "h2", id: "growth", title: "成长" },
      {
        kind: "p",
        text: "成长使用登记垃圾和上次更新里较晚的那个 tick，并且只在拥有者与垃圾拥有者相同的时候发生。银每个 tick 增加银成长，直到银上限。材料只在小行星带（Asteroid Field）产出，产速和上限与银相同。结算时使用当时读到的产速计算尚未结算的时段。",
      },
      { kind: "h2", id: "energy-curve", title: "能量曲线" },
      {
        kind: "p",
        text: "能量沿一条 S 形曲线走向能量上限。面板上的能量成长，是能量正好等于上限一半时、每个 tick 增加的数量。越接近 0 或越接近上限，实际增加越慢。能量成长为 0 时不成长，类星体（Quasar）就是这样。",
      },
      {
        kind: "p",
        text: "公式里的能量、上限和成长必须用同一套单位。页面上这三个数已经是链上数量除以 1000，可以直接代入。t 是经过的 tick。时钟速率为 1 时，一个 tick 是一秒。",
      },
      { kind: "energy-figure" },
      {
        kind: "p",
        text: "当前远小于上限时，速度大约是成长 × 4 × 当前 / 上限。星云里一颗没有升级、属性也没有加倍的 4 级行星（Planet），页面上的上限是 25000，成长是 2.08。从页面上的 1 点算起，当时大约每个 tick 增加 0.00033。",
      },
      {
        kind: "table",
        headers: ["从 1 点长到", "大约时间"],
        rows: [
          ["2", "35 分钟"],
          ["10", "1.9 小时"],
          ["100", "3.8 小时"],
          ["1000", "5.8 小时"],
          ["12500（一半）", "8.4 小时"],
          ["22500（九成）", "10.3 小时"],
        ],
      },
      {
        kind: "p",
        text: "出发后链上至少留下 1。页面把链上数量除以 1000，所以这 1 显示为 0.00。同一颗星从 0.00 长到页面上的 1，大约还要 5.8 小时。太空、深空、死空和升级把上限与成长乘同一个倍数，从同一个满能量比例回到一半的时间不变；从固定的 1 点往回长，上限越大越久。",
      },
      { kind: "h2", id: "buy", title: "买银" },
      {
        kind: "p",
        text: "银到账后可用于升级行星，也可以运往时空裂隙提取。购买使用的 AIPRO 中有 50% 会直接销毁，50% 会分给游戏的积分排行榜，由玩家瓜分。",
      },
      {
        kind: "p",
        text: "同级星球的购买档位相同，数量按星云基础银上限的 20%、50%、80%、150% 计算。升级星球不会改变购买档位或价格。下表每格依次列出未打折的 AIPRO 价格和游戏界面的银数量。",
      },
      {
        kind: "table",
        numericColumns: [0, 1, 2, 3, 4],
        headers: ["等级", "20%", "50%", "80%", "150%"],
        rows: [
          ["1", "1000 / 20", "2500 / 50", "4000 / 80", "7500 / 150"],
          ["2", "2500 / 100", "6250 / 250", "10000 / 400", "18750 / 750"],
          ["3", "6250 / 500", "15625 / 1250", "25000 / 2000", "46875 / 3750"],
          [
            "4",
            "15000 / 2400",
            "37500 / 6000",
            "60000 / 9600",
            "112500 / 18000",
          ],
          [
            "5",
            "34000 / 10000",
            "85000 / 25000",
            "135000 / 40000",
            "255000 / 75000",
          ],
          [
            "6",
            "50000 / 20000",
            "125000 / 50000",
            "200000 / 80000",
            "375000 / 150000",
          ],
          [
            "7",
            "75000 / 40000",
            "187500 / 100000",
            "300000 / 160000",
            "562500 / 300000",
          ],
          [
            "8",
            "95000 / 60000",
            "237500 / 150000",
            "380000 / 240000",
            "712500 / 450000",
          ],
          [
            "9",
            "110000 / 80000",
            "275000 / 200000",
            "440000 / 320000",
            "825000 / 600000",
          ],
        ],
      },
      { kind: "h2", id: "silver-discount", title: "买银折扣" },
      {
        kind: "p",
        text: "全局进度取曾被占领的最高星球等级，且只会上升。0 级母星不计入进度。星球每低于进度 1 级，价格减去原价的 10%。AIPRO 价格四舍五入到整数，银数量保持原值。",
      },
      {
        kind: "table",
        headers: ["进度", "这颗星", "价格"],
        rows: [
          ["2", "1 级", "90%"],
          ["6", "5 级到 1 级", "90%、80%、70%、60%、50%"],
          ["9", "8 级到 1 级", "90% 起，每低一级再少 10%，到 1 级是 20%"],
          [
            "4",
            "3 级 50% 档",
            "15625 的 90% 是 14062.5，收取 14063，银仍是 1250",
          ],
        ],
      },
      {
        kind: "p",
        text: "0 级星球没有档位。时空裂隙（Spacetime Rip）上、垃圾拥有者不同、还没登记垃圾、买下后银会超过上限时，调用失败。还没有玩家进入积分排行榜时，这次购买也会失败。",
      },
      { kind: "h2", id: "withdraw", title: "提取" },
      {
        kind: "p",
        text: "在自己已登记的时空裂隙提取银或材料。每次提取至少达到银上限的 20%，该门槛同时适用于银和材料。",
      },
      {
        kind: "p",
        text: "提取银时按链上数量计分，提取材料时按「链上数量 × 材料倍率」计分，倍率为 100 到 600 倍。每次新增分数同步计入个人质押，并计入所属公会的银统计。",
      },
      { kind: "h2", id: "multipliers-table", title: "材料倍率" },
      {
        kind: "table",
        numericColumns: [0, 2],
        headers: ["编号", "材料", "倍率"],
        rows: [
          [
            "0",
            materialLabel(MaterialType.UNKNOWN, "未知（Unknown）"),
            "100 倍",
          ],
          [
            "1",
            materialLabel(
              MaterialType.WATER_CRYSTALS,
              "水晶体（Water Crystals）",
            ),
            "105 倍",
          ],
          [
            "2",
            materialLabel(MaterialType.LIVING_WOOD, "活木（Living Wood）"),
            "110 倍",
          ],
          [
            "3",
            materialLabel(MaterialType.WINDSTEEL, "风钢（Wind Steel）"),
            "120 倍",
          ],
          [
            "4",
            materialLabel(MaterialType.AURORIUM, "极光金（Aurorium）"),
            "130 倍",
          ],
          [
            "5",
            materialLabel(MaterialType.MYCELIUM, "菌胶（Mycelium）"),
            "150 倍",
          ],
          [
            "6",
            materialLabel(MaterialType.SANDGLASS, "沙玻璃（Sand Glass）"),
            "180 倍",
          ],
          [
            "7",
            materialLabel(MaterialType.CRYOSTONE, "冰晶石（Cryostone）"),
            "200 倍",
          ],
          [
            "8",
            materialLabel(MaterialType.SCRAPIUM, "废金（Scrapium）"),
            "250 倍",
          ],
          [
            "9",
            materialLabel(MaterialType.PYROSTEEL, "火钢（Pyrosteel）"),
            "300 倍",
          ],
          [
            "10",
            materialLabel(MaterialType.BLACKALLOY, "黑合金（Blackalloy）"),
            "400 倍",
          ],
          [
            "11",
            materialLabel(
              MaterialType.CORRUPTED_CRYSTAL,
              "腐化水晶（Corrupted Crystal）",
            ),
            "600 倍",
          ],
        ],
      },
      {
        kind: "rich",
        parts: [
          "死空是腐化生态，长",
          materialLabel(MaterialType.BLACKALLOY, "黑合金（Blackalloy）"),
          "和",
          materialLabel(
            MaterialType.CORRUPTED_CRYSTAL,
            "腐化水晶（Corrupted Crystal）",
          ),
          "。其他空间类型长一种材料。星云是",
          materialLabel(
            MaterialType.WATER_CRYSTALS,
            "水晶体（Water Crystals）",
          ),
          "、",
          materialLabel(MaterialType.LIVING_WOOD, "活木（Living Wood）"),
          "或",
          materialLabel(MaterialType.WINDSTEEL, "风钢（Wind Steel）"),
          "。太空是",
          materialLabel(MaterialType.AURORIUM, "极光金（Aurorium）"),
          "、",
          materialLabel(MaterialType.MYCELIUM, "菌胶（Mycelium）"),
          "或",
          materialLabel(MaterialType.SANDGLASS, "沙玻璃（Sand Glass）"),
          "。深空是",
          materialLabel(MaterialType.CRYOSTONE, "冰晶石（Cryostone）"),
          "、",
          materialLabel(MaterialType.SCRAPIUM, "废金（Scrapium）"),
          "或",
          materialLabel(MaterialType.PYROSTEEL, "火钢（Pyrosteel）"),
          "。三种里取哪一种，看生态基数：低于 15 是第一种，低于 17 是第二种，否则是第三种。每种生态的画面见地图一章。",
        ],
      },
    ],
  },
  {
    id: "pool",
    title: "Nutbox 矿池",
    blocks: [
      {
        kind: "p",
        text: "Nutbox 分数池把游戏进度转成领奖份额。把银或材料运到自己已登记的时空裂隙并提取，分数会自动计入当前世界的矿池。随后可以领取游戏奖励和社区奖励。",
      },
      { kind: "h2", id: "stake", title: "分数如何计入质押" },
      {
        kind: "ul",
        items: [
          "提取银时按提取量计分。提取材料时按材料数量乘以对应倍率计分。",
          "每次新增分数同时增加个人质押和全池总质押。质押的单位是游戏分数，计分时无需转入代币。",
          "个人份额约等于「个人质押 ÷ 全池质押」。你继续得分时，个人质押会上升。其他玩家得分也会改变全池总质押。",
        ],
      },
      {
        kind: "p",
        text: "例如，个人质押为 2,500 分、全池质押为 10,000 分时，份额是 25%。如果此时游戏分数池注入 1,000 枚代币，这次约分到 250 枚，精确数值以链上结算为准。",
      },
      { kind: "h2", id: "reward-sources", title: "游戏奖励与社区奖励" },
      {
        kind: "table",
        headers: ["奖励", "资金来源", "分配方式"],
        rows: [
          [
            "游戏奖励",
            "玩家购买银时，支付的游戏代币扣除销毁部分后，余款注入本局分数池。",
            "每次注入按当时的质押份额分配。买银者已有的质押也参与本次分配。",
          ],
          [
            "社区奖励",
            "社区注入的代币由 Nutbox 的小时计算器分 168 小时释放。",
            "社区先按设置的权重分配给开放的矿池，再在池内按质押份额结算给玩家。",
          ],
        ],
      },
      {
        kind: "p",
        text: "买银的销毁比例以本局配置为准。例如比例为 50% 时，支付 1,000 枚代币，500 枚销毁，500 枚进入游戏分数池。游戏分数池已有质押，才可以分配这笔注入。",
      },
      { kind: "h2", id: "claim", title: "查看和领取" },
      {
        kind: "ol",
        items: [
          "进入星图，打开「游戏信息」，查看「游戏奖励」和「社区奖励」两项待领余额。",
          "点击对应一行的「领取」，把复制的指令粘贴给用于本局游戏的 Agent。两笔余额分别领取。",
          "交易确认后刷新余额。领取后，分数和已累计的质押保持有效。取回入场 NFT 后，钱包仍可领取已有奖励。",
        ],
      },
      {
        kind: "p",
        text: "游戏奖励由本局分数池支付，社区奖励由社区合约支付。首页「累计发放奖励」合计社区已释放和本局分数池已注入的代币，包含尚未领取的部分。矿池卡片的「每小时奖励」显示社区当前的释放速度。个人待领金额以「游戏信息」为准。",
      },
      { kind: "h2", id: "one-pool", title: "换局和关闭矿池" },
      {
        kind: "p",
        text: "每局绑定独立的游戏分数池。新一局从零开始计分，旧局的分数、质押和待领奖励留在原池。关闭社区分配后，已经计入旧池的社区奖励仍可领取，之后释放的社区代币按新的权重分配。游戏奖励的注入由买银规则单独决定。",
      },
    ],
  },
  {
    id: "more",
    title: "其他",
    blocks: [
      { kind: "h2", id: "artifacts", title: "神器" },
      {
        kind: "p",
        text: "铸造厂发现的四种神器等概率。属性倍率按 100 算一份，虫洞的距离系数按 1000 算一份。下面的时间都是已存储的 tick，换成秒要除以这一局的 tickRate。游戏信息里的拥有神器，以及这件神器所在星球的详情，都可以复制充能、激活、关闭或摧毁，也可以点运送，再从这颗星球拖到目标星球，和运银一样。一跳到不了就再选再拖。页面不签名。",
      },
      { kind: "h2", id: "cannon", title: "火炮" },
      {
        kind: "p",
        text: "火炮（Photoid Cannon）先充能 14400 tick，冷却是 0，用完即毁，没有等级限制。一颗星球同时只能有一门火炮在充能或待发。充能期间防御按稀有度缩小。激活之后，下一次移动的射程变成 2 倍，速度按稀有度放大。这次移动发出后，防御削弱和移动加成一起去掉。",
      },
      {
        kind: "table",
        numericColumns: [1, 2, 3],
        headers: ["稀有度", "充能时防御", "激活后射程", "激活后速度"],
        rows: [
          ["普通", "50%", "200%", "500%"],
          ["稀有", "40%", "200%", "1000%"],
          ["史诗", "30%", "200%", "1500%"],
          ["传说", "20%", "200%", "2000%"],
          ["神话", "10%", "200%", "2500%"],
        ],
      },
      { kind: "h2", id: "wormhole", title: "虫洞" },
      {
        kind: "p",
        text: "虫洞（Wormhole）不用充能，激活后冷却 14400 tick，可以反复开关。两端必须是同一个拥有者，不能连自己。距离乘以系数再除以 1000。这条连线上已经有系数时，新系数是旧系数乘以这次的系数再除以 1000。关掉虫洞时用同一次除法把这次的系数除掉。",
      },
      {
        kind: "table",
        numericColumns: [1],
        headers: ["稀有度", "距离系数"],
        rows: [
          ["普通", "500"],
          ["稀有", "250"],
          ["史诗", "125"],
          ["传说", "62"],
          ["神话", "31"],
        ],
      },
      { kind: "h2", id: "bloom", title: "布隆过滤器" },
      {
        kind: "p",
        text: "布隆过滤器（Bloom Filter）不用充能，也不冷却。激活把这颗星球的能量设成能量上限，然后神器损坏。稀有度决定能用在哪一段等级上，下限包含，上限不包含。",
      },
      {
        kind: "table",
        headers: ["稀有度", "星球等级"],
        rows: [
          ["普通", "0、1、2"],
          ["稀有", "3、4"],
          ["史诗", "5、6"],
          ["传说", "7、8"],
          ["神话", "9"],
        ],
      },
      { kind: "h2", id: "bomb", title: "粉红炸弹" },
      {
        kind: "p",
        text: "粉红炸弹（Pink Bomb）充能 14400 tick，激活后再冷却 14400 tick，用完即毁。充能揭示目标坐标。激活揭示发射星球，并把射程和速度暂时变成一半，只用于这次发射的计算。发射消耗的能量是能量上限 / 20 × 2^(距离/射程)，飞行 tick 是距离 × 100 / 速度。到达之后的 300 tick 内，可以摧毁目标周围这个半径里的星球。",
      },
      {
        kind: "table",
        numericColumns: [2],
        headers: ["稀有度", "星球等级", "摧毁半径"],
        rows: [
          ["普通", "4", "500"],
          ["稀有", "4、5", "1000"],
          ["史诗", "4 到 6", "1500"],
          ["传说", "4 到 8", "2000"],
          ["神话", "4 到 9", "2500"],
        ],
      },
      { kind: "h2", id: "guild", title: "公会" },
      {
        kind: "p",
        text: "公会让成员互相增援，而不是互相攻击。创建一个公会花费 0.02 BNB，这笔 BNB 和买配额的付款一样进入命名空间余额。",
      },
      { kind: "h2", id: "reveal", title: "揭示和召回" },
      {
        kind: "p",
        text: "揭示会公开坐标。冷却是 14400 个已存储的 tick。揭示不移动能量、银或质押。召回允许在航程的前一半进行，舰队带着一半能量和一半银回来。时钟暂停在 0、并且舰队是在 tick 0 发出的，也可以召回。",
      },
    ],
  },
];

export function chapterHeadings(
  chapter: DocChapter,
): { id: string; title: string }[] {
  return chapter.blocks.flatMap((block) =>
    block.kind === "h2" ? [{ id: block.id, title: block.title }] : [],
  );
}

export function findChapter(id: string | undefined): DocChapter {
  return gameDocs.find((chapter) => chapter.id === id) ?? gameDocs[0];
}
