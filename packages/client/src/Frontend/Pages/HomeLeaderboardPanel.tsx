import { useComponentValue } from "@latticexyz/react";
import { singletonEntity } from "@latticexyz/store-sync/recs";
import { useMUD } from "@mud/MUDContext";
import { useEffect, useState } from "react";
import styled from "styled-components";
import {
  type Address,
  isAddress,
  parseAbi,
  type PublicClient,
  zeroAddress,
} from "viem";

import dfstyles from "../Styles/dfstyles";
import {
  displayHandle,
  displayMetric,
  fetchHomeBoard,
  type HomeBoardMode,
  type HomeBoardRow,
  metricOf,
} from "./homeLeaderboard";

const HANDLE_ABI = parseAbi([
  "function handleRegistry() view returns (address)",
  "function handleOf(address owner) view returns (string)",
]);

const Panel = styled.section`
  padding: 16px 18px;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid ${dfstyles.colors.border};
`;

const TitleRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const Title = styled.h2`
  margin: 0;
  color: ${dfstyles.colors.dfpink};
  font-size: 15px;
  font-weight: 600;
`;

const Modes = styled.div`
  display: flex;
  gap: 8px;
`;

const ModeButton = styled.button<{ $active: boolean }>`
  border: 1px solid ${dfstyles.colors.border};
  background: ${(props) =>
    props.$active ? dfstyles.colors.dfgreen : "transparent"};
  color: ${(props) => (props.$active ? "#04110c" : dfstyles.colors.text)};
  padding: 4px 10px;
  cursor: pointer;
`;

const Status = styled.p`
  margin: 12px 0 0;
  color: ${dfstyles.colors.subtext};
  font-size: 14px;
`;

const Table = styled.table`
  width: 100%;
  margin-top: 12px;
  border-collapse: collapse;
  font-size: 14px;

  th {
    padding: 6px 8px;
    color: ${dfstyles.colors.subtext};
    font-weight: 500;
    text-align: left;
  }

  td {
    padding: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  td:first-child,
  td:last-child,
  th:first-child,
  th:last-child {
    text-align: right;
    width: 88px;
  }
`;

type ListedRow = HomeBoardRow & { label: string };

export function HomeLeaderboardPanel() {
  const {
    network: { publicClient },
    components: { GamePassNFT },
  } = useMUD();
  const pass = useComponentValue(GamePassNFT, singletonEntity);
  const [mode, setMode] = useState<HomeBoardMode>("score");
  const [rows, setRows] = useState<ListedRow[]>([]);
  const [status, setStatus] = useState("正在读取");

  useEffect(() => {
    let stopped = false;
    const load = async () => {
      setStatus("正在读取");
      try {
        const board = await fetchHomeBoard(mode);
        const handles = await readHandles(
          publicClient,
          pass?.addr,
          board.map((row) => row.address),
        );
        if (stopped) return;
        setRows(
          board.map((row) => ({
            ...row,
            label: displayHandle(
              row.address,
              handles.get(row.address.toLowerCase()),
            ),
          })),
        );
        setStatus(board.length === 0 ? "还没有上榜的玩家" : "");
      } catch (error) {
        console.error(error);
        if (!stopped) {
          setRows([]);
          setStatus("排行榜读不到");
        }
      }
    };
    void load();
    return () => {
      stopped = true;
    };
  }, [mode, pass?.addr, publicClient]);

  return (
    <Panel>
      <TitleRow>
        <Title>排行榜</Title>
        <Modes>
          <ModeButton
            type="button"
            $active={mode === "score"}
            onClick={() => setMode("score")}
          >
            分数
          </ModeButton>
          <ModeButton
            type="button"
            $active={mode === "kills"}
            onClick={() => setMode("kills")}
          >
            击杀
          </ModeButton>
        </Modes>
      </TitleRow>
      {status && <Status>{status}</Status>}
      {rows.length > 0 && (
        <Table>
          <thead>
            <tr>
              <th>名次</th>
              <th>玩家</th>
              <th>{mode === "score" ? "分数" : "击杀"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.address}>
                <td>{row.rank}</td>
                <td title={row.address}>{row.label}</td>
                <td>{displayMetric(metricOf(row, mode))}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Panel>
  );
}

/** 保管合约指向登记处。登记处按钱包返回 Binance handle，空字符串表示没有。 */
async function readHandles(
  publicClient: PublicClient,
  locker: string | undefined,
  addresses: string[],
): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  if (
    !locker ||
    !isAddress(locker) ||
    locker === zeroAddress ||
    addresses.length === 0
  ) {
    return found;
  }
  let registry: Address;
  try {
    registry = await publicClient.readContract({
      address: locker,
      abi: HANDLE_ABI,
      functionName: "handleRegistry",
    });
  } catch {
    return found;
  }
  if (!isAddress(registry) || registry === zeroAddress) {
    return found;
  }
  const contracts = addresses
    .filter((address): address is Address => isAddress(address))
    .map((address) => ({
      address: registry,
      abi: HANDLE_ABI,
      functionName: "handleOf" as const,
      args: [address] as [Address],
    }));
  const results = await publicClient.multicall({
    allowFailure: true,
    contracts,
  });
  contracts.forEach((call, index) => {
    const result = results[index];
    if (result?.status === "success" && result.result) {
      found.set(call.args[0].toLowerCase(), result.result);
    }
  });
  return found;
}
