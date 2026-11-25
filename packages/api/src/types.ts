export type LeaderboardMode = "score" | "kills";

export type LeaderboardRow = {
  address: string;
  name: string | null;
  score: string;
  kills: string;
  rank: number;
};

export type PlayerRankResponse = {
  address: string;
  score: string;
  kills: string;
  scoreRank: number | null;
  killsRank: number | null;
};

export type LeaderboardSnapshot = {
  blockNumber: bigint;
  players: ReadonlyMap<
    string,
    { name: string; burner: string; createdAt: bigint }
  >;
  scores: ReadonlyMap<string, bigint>;
  kills: ReadonlyMap<string, bigint>;
};
