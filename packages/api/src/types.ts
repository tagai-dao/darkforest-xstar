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
