import { ArtifactRarity } from "@df/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import styled from "styled-components";

import { Spacer } from "../Components/CoreUI";
import { TwitterLink } from "../Components/Labels/Labels";
import { LoadingSpinner } from "../Components/LoadingSpinner";
import { Red } from "../Components/Text";
import { TextPreview } from "../Components/TextPreview";
import { RarityColors } from "../Styles/Colors";
import dfstyles from "../Styles/dfstyles";
import { formatDuration } from "../Utils/TimeUtils";
import { GenericErrorBoundary } from "./GenericErrorBoundary";
import { Table } from "./Table";

type LeaderboardMode = "score" | "kills";
type LeaderboardEntry = {
  address: string;
  name: string | null;
  score: string;
  kills: string;
  rank: number;
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ??
  import.meta.env.VITE_LEADERBOARD_API_URL ??
  "http://localhost:4100") as string;

const toWsUrl = (httpUrl: string) => {
  if (httpUrl.startsWith("https://"))
    return httpUrl.replace("https://", "wss://");
  if (httpUrl.startsWith("http://")) return httpUrl.replace("http://", "ws://");
  return httpUrl;
};

export function LeadboardDisplay() {
  const [mode, setMode] = useState<LeaderboardMode>("score");
  const [rows, setRows] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const errorMessage = "Error Loading Leaderboard";

  const fetchLeaderboard = useCallback(async (targetMode: LeaderboardMode) => {
    setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/leaderboard/${targetMode}?limit=100&offset=0`,
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch leaderboard: ${response.status}`);
      }
      const payload = (await response.json()) as { rows?: LeaderboardEntry[] };
      setRows(payload.rows ?? []);
      setError(null);
    } catch (fetchError) {
      console.error(fetchError);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLeaderboard(mode);
  }, [fetchLeaderboard, mode]);

  useEffect(() => {
    const wsUrl = `${toWsUrl(API_BASE_URL)}/api/leaderboard`;
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as {
          type?: string;
          scoreRows?: LeaderboardEntry[];
          killRows?: LeaderboardEntry[];
        };
        if (payload.type !== "leaderboard_update") return;
        setRows(
          mode === "score"
            ? (payload.scoreRows ?? [])
            : (payload.killRows ?? []),
        );
      } catch (wsError) {
        console.error("Failed to parse leaderboard ws message:", wsError);
      }
    };
    ws.onerror = (wsError) => {
      console.error("Leaderboard websocket error:", wsError);
    };
    return () => ws.close();
  }, [mode]);

  const rankedPlayersCount = useMemo(
    () =>
      rows.filter((entry) => {
        const metric = mode === "score" ? entry.score : entry.kills;
        return BigInt(metric) > 0n;
      }).length,
    [mode, rows],
  );

  return (
    <GenericErrorBoundary errorMessage={errorMessage}>
      <ModeSwitcher>
        <ModeButton
          type="button"
          $active={mode === "score"}
          onClick={() => setMode("score")}
        >
          Score
        </ModeButton>
        <ModeButton
          type="button"
          $active={mode === "kills"}
          onClick={() => setMode("kills")}
        >
          Kills
        </ModeButton>
      </ModeSwitcher>

      {loading && <LoadingSpinner initialText={"Loading Leaderboard..."} />}
      {!loading && !error && (
        <LeaderboardBody
          rows={rows}
          mode={mode}
          rankedPlayersCount={rankedPlayersCount}
        />
      )}
      {error && <Red>{error}</Red>}
    </GenericErrorBoundary>
  );
}

function metricToString(metric: string) {
  if (!metric) {
    return "n/a";
  }
  return BigInt(metric).toLocaleString();
}

// pass in either an address, or a twitter handle. this function will render the appropriate
// component
function playerToEntry(playerStr: string, color: string) {
  // if this is an address
  if (playerStr.startsWith("0x") && playerStr.length === 42) {
    return (
      <TextPreview
        text={playerStr}
        focusedWidth={"150px"}
        unFocusedWidth={"150px"}
      />
    );
  }

  return <TwitterLink twitter={playerStr} color={color} />;
}

function getRankColor([rank, metric]: [number, string]) {
  if (!metric || BigInt(metric) === 0n) {
    return dfstyles.colors.subtext;
  }

  if (rank === 0) {
    return RarityColors[ArtifactRarity.Mythic];
  }

  if (rank === 1 || rank === 2) {
    return RarityColors[ArtifactRarity.Legendary];
  }

  if (rank >= 3 && rank <= 6) {
    return RarityColors[ArtifactRarity.Epic];
  }

  if (rank >= 7 && rank <= 14) {
    return RarityColors[ArtifactRarity.Rare];
  }

  if (rank >= 15 && rank <= 30) {
    return dfstyles.colors.dfgreen;
  }

  if (rank >= 31 && rank <= 62) {
    return "white";
  }

  return dfstyles.colors.subtext;
}

function LeaderboardTable({
  rows,
  mode,
}: {
  rows: LeaderboardEntry[];
  mode: LeaderboardMode;
}) {
  const metricName = mode === "score" ? "score" : "kills";
  return (
    <TableContainer>
      <Table
        alignments={["r", "l", "r"]}
        headers={[
          <Cell key="place">place</Cell>,
          <Cell key="player">player</Cell>,
          <Cell key={metricName}>{metricName}</Cell>,
        ]}
        rows={rows}
        columns={[
          (row: LeaderboardEntry, i) => {
            const metric = mode === "score" ? row.score : row.kills;
            return (
              <Cell style={{ color: getRankColor([i, metric]) }}>
                {BigInt(metric) === 0n ? "unranked" : row.rank + "."}
              </Cell>
            );
          },
          (row: LeaderboardEntry, i) => {
            const metric = mode === "score" ? row.score : row.kills;
            const color = getRankColor([i, metric]);
            const playerLabel =
              row.name && row.name.length > 0 ? row.name : row.address;
            return (
              <Cell style={{ color }}>{playerToEntry(playerLabel, color)}</Cell>
            );
          },
          (row: LeaderboardEntry, i) => {
            const metric = mode === "score" ? row.score : row.kills;
            return (
              <Cell style={{ color: getRankColor([i, metric]) }}>
                {metricToString(metric)}
              </Cell>
            );
          },
        ]}
      />
    </TableContainer>
  );
}

// TODO: update this each round, or pull from contract constants
const roundEndTimestamp = "2021-10-05T04:00:00.000Z";
const roundEndTime = new Date(roundEndTimestamp).getTime();

function CountDown() {
  const [str, setStr] = useState("");

  const update = () => {
    const timeUntilEndms = roundEndTime - new Date().getTime();
    if (timeUntilEndms <= 0) {
      setStr("yes");
    } else {
      setStr(formatDuration(timeUntilEndms));
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      update();
    }, 499);

    update();

    return () => clearInterval(interval);
  }, []);

  return <>{str}</>;
}

function LeaderboardBody({
  rows,
  mode,
  rankedPlayersCount,
}: {
  rows: LeaderboardEntry[];
  mode: LeaderboardMode;
  rankedPlayersCount: number;
}) {
  return (
    <div>
      <StatsTableContainer>
        <StatsTable>
          <tbody>
            <tr>
              <td>round complete</td>
              <td>
                <CountDown />
              </td>
            </tr>
            <tr>
              <td>players</td>
              <td>{rows.length}</td>
            </tr>
            <tr>
              <td>ranked players</td>
              <td>{rankedPlayersCount}</td>
            </tr>
          </tbody>
        </StatsTable>
      </StatsTableContainer>
      <Spacer height={8} />
      <LeaderboardTable rows={rows} mode={mode} />
    </div>
  );
}

const ModeSwitcher = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 12px;
`;

const ModeButton = styled.button<{ $active: boolean }>`
  border: 1px solid ${dfstyles.colors.border};
  background: ${(props) =>
    props.$active ? dfstyles.colors.text : "transparent"};
  color: ${(props) => (props.$active ? "black" : dfstyles.colors.text)};
  padding: 4px 10px;
  cursor: pointer;
  border-radius: 4px;
`;

const Cell = styled.div`
  padding: 4px 8px;
  color: ${dfstyles.colors.text};
`;

const TableContainer = styled.div`
  display: inline-block;
  border-radius: 2px 2px 0 0px;
  border-bottom: none;
  padding: 16px;
`;

const StatsTableContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  color: ${dfstyles.colors.text};
`;

const StatsTable = styled.table`
  td {
    padding: 4px 8px;

    &:first-child {
      text-align: right;
      color: ${dfstyles.colors.subtext};
    }

    &:last-child {
      text-align: left;
    }
  }
`;
