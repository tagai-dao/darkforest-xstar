export type HomeBoardMode = "score" | "kills";

export type HomeBoardRow = {
  address: string;
  score: string;
  kills: string;
  rank: number;
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ??
  import.meta.env.VITE_LEADERBOARD_API_URL ??
  "http://localhost:4100") as string;

/** 缩短钱包地址，仅作没名字时的兜底。 */
export function shortAddress(address: string): string {
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * 首页榜只显示名字。加入游戏必须有名字，读不到 handle 时才退回缩短地址。
 */
export function displayPlayerName(
  address: string,
  handle: string | undefined,
): string {
  const name = handle?.trim();
  return name || shortAddress(address);
}

/** @deprecated 用 displayPlayerName；保留别名以免旧引用炸掉。 */
export const displayHandle = displayPlayerName;

/** 链上分数和击杀与银一样，页面上除以 1000。 */
export function displayMetric(raw: string): string {
  try {
    return Number(BigInt(raw) / 1000n).toLocaleString("zh-CN");
  } catch {
    return "0";
  }
}

export function metricOf(row: HomeBoardRow, mode: HomeBoardMode): string {
  return mode === "score" ? row.score : row.kills;
}

export async function fetchHomeBoard(
  mode: HomeBoardMode,
): Promise<HomeBoardRow[]> {
  const response = await fetch(
    `${API_BASE_URL}/api/leaderboard/${mode}?limit=100&offset=0`,
  );
  if (!response.ok) {
    throw new Error(`leaderboard ${response.status}`);
  }
  const payload = (await response.json()) as { rows?: HomeBoardRow[] };
  return payload.rows ?? [];
}
