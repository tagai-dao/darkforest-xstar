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

/** 榜上优先显示 Binance handle。没登记时用缩短地址，避免整段钱包地址占满一行。 */
export function displayHandle(
  address: string,
  handle: string | undefined,
): string {
  const name = handle?.trim();
  if (name) {
    return name;
  }
  if (address.length < 10) {
    return address;
  }
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

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
