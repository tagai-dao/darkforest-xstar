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
  displayMetric,
  displayPlayerName,
  fetchHomeBoard,
  type HomeBoardMode,
  type HomeBoardRow,
  metricOf,
} from "./homeLeaderboard";

const HANDLE_ABI = parseAbi([
  "function handleRegistry() view returns (address)",
  "function handleOf(address owner) view returns (string)",
]);

const MULTICALL3: Address = "0xcA11bde05977b3631167028862bE2a173976CA11";

const Panel = styled.section<{ $framed: boolean }>`
  padding: ${(props) => (props.$framed ? "16px 18px" : "0")};
  background: ${(props) =>
    props.$framed ? "rgba(0, 0, 0, 0.45)" : "transparent"};
  border: ${(props) =>
    props.$framed ? `1px solid ${dfstyles.colors.border}` : "none"};
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

/** 名次、分数收窄，玩家列吃剩余宽度。 */
const Table = styled.table`
  width: 100%;
  margin-top: 12px;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 14px;

  th {
    padding: 6px 6px;
    color: ${dfstyles.colors.subtext};
    font-weight: 500;
    text-align: left;
  }

  td {
    padding: 8px 6px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    vertical-align: top;
  }

  th:nth-child(1),
  td:nth-child(1) {
    width: 40px;
    text-align: right;
    white-space: nowrap;
  }

  th:nth-child(2),
  td:nth-child(2) {
    width: auto;
    overflow-wrap: anywhere;
  }

  th:nth-child(3),
  td:nth-child(3) {
    width: 64px;
    text-align: right;
    white-space: nowrap;
  }
`;

const PlayerName = styled.div`
  color: ${dfstyles.colors.text};
`;

const AddressButton = styled.button`
  display: block;
  margin-top: 4px;
  padding: 0;
  border: none;
  background: none;
  color: ${dfstyles.colors.subtext};
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  word-break: break-all;

  &:hover {
    color: ${dfstyles.colors.dfgreen};
    text-decoration: underline;
  }
`;

const MoreButton = styled.button`
  margin-top: 10px;
  padding: 4px 10px;
  border: 1px solid ${dfstyles.colors.dfgreen};
  background: transparent;
  color: ${dfstyles.colors.dfgreen};
  font: inherit;
  cursor: pointer;
`;

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.72);
`;

const Modal = styled.div`
  width: min(720px, 100%);
  max-height: min(80vh, 720px);
  overflow: auto;
  padding: 18px;
  background: #0a1012;
  border: 1px solid ${dfstyles.colors.dfgreen};
`;

type ListedRow = HomeBoardRow & { name: string };

type Props = {
  /** 预览条数；不传则显示全部。 */
  previewLimit?: number;
  /** false 时去掉外边框，嵌进「游戏数据」卡片。 */
  framed?: boolean;
  showTitle?: boolean;
};

export function HomeLeaderboardPanel({
  previewLimit,
  framed = true,
  showTitle = true,
}: Props) {
  const {
    network: { publicClient },
    components: { GamePassNFT },
  } = useMUD();
  const pass = useComponentValue(GamePassNFT, singletonEntity);
  // 首页预览固定分数榜；弹窗里才切换分数 / 击杀。
  const [modalMode, setModalMode] = useState<HomeBoardMode>("score");
  const [scoreRows, setScoreRows] = useState<ListedRow[]>([]);
  const [killRows, setKillRows] = useState<ListedRow[]>([]);
  const [status, setStatus] = useState("正在读取");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let stopped = false;
    const load = async () => {
      setStatus("正在读取");
      try {
        const [scoreBoard, killBoard] = await Promise.all([
          fetchHomeBoard("score"),
          fetchHomeBoard("kills"),
        ]);
        const addresses = [
          ...new Set([
            ...scoreBoard.map((row) => row.address),
            ...killBoard.map((row) => row.address),
          ]),
        ];
        let handles = new Map<string, string>();
        try {
          handles = await readHandles(publicClient, pass?.addr, addresses);
        } catch (handleError) {
          console.error(handleError);
        }
        if (stopped) return;

        const withName = (board: HomeBoardRow[]): ListedRow[] =>
          board.map((row) => ({
            ...row,
            name: displayPlayerName(
              row.address,
              handles.get(row.address.toLowerCase()),
            ),
          }));

        setScoreRows(withName(scoreBoard));
        setKillRows(withName(killBoard));
        setStatus(scoreBoard.length === 0 ? "还没有上榜的玩家" : "");
      } catch (error) {
        console.error(error);
        if (!stopped) {
          setScoreRows([]);
          setKillRows([]);
          setStatus("排行榜读不到");
        }
      }
    };
    void load();
    return () => {
      stopped = true;
    };
  }, [pass?.addr, publicClient]);

  const preview =
    previewLimit !== undefined ? scoreRows.slice(0, previewLimit) : scoreRows;
  // 有预览截断时始终给「更多」，方便进弹窗看击杀榜。
  const showMore = previewLimit !== undefined;

  const modalRows = modalMode === "score" ? scoreRows : killRows;

  return (
    <>
      <Panel $framed={framed}>
        {showTitle ? (
          <TitleRow>
            <Title>排行榜</Title>
          </TitleRow>
        ) : null}
        {status && <Status>{status}</Status>}
        {preview.length > 0 && (
          <BoardTable mode="score" rows={preview} variant="preview" />
        )}
        {showMore && (
          <MoreButton type="button" onClick={() => setOpen(true)}>
            更多
          </MoreButton>
        )}
      </Panel>
      {open && (
        <Overlay role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
          <Modal onClick={(event) => event.stopPropagation()}>
            <TitleRow>
              <Title>排行榜</Title>
              <MoreButton type="button" onClick={() => setOpen(false)}>
                关闭
              </MoreButton>
            </TitleRow>
            <Modes style={{ marginTop: 12 }}>
              <ModeButton
                type="button"
                $active={modalMode === "score"}
                onClick={() => setModalMode("score")}
              >
                分数
              </ModeButton>
              <ModeButton
                type="button"
                $active={modalMode === "kills"}
                onClick={() => setModalMode("kills")}
              >
                击杀
              </ModeButton>
            </Modes>
            {modalRows.length > 0 ? (
              <BoardTable mode={modalMode} rows={modalRows} variant="modal" />
            ) : (
              <Status>还没有上榜的玩家</Status>
            )}
          </Modal>
        </Overlay>
      )}
    </>
  );
}

function BoardTable({
  mode,
  rows,
  variant,
}: {
  mode: HomeBoardMode;
  rows: ListedRow[];
  variant: "preview" | "modal";
}) {
  return (
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
            <td>
              {variant === "preview" ? (
                <PlayerName>{row.name}</PlayerName>
              ) : (
                <ModalPlayer name={row.name} address={row.address} />
              )}
            </td>
            <td>{displayMetric(metricOf(row, mode))}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

/** 弹窗：名字 + 完整地址；点地址复制。 */
function ModalPlayer({ name, address }: { name: string; address: string }) {
  const [copied, setCopied] = useState(false);

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <>
      <PlayerName>{name}</PlayerName>
      <AddressButton
        type="button"
        title={copied ? "已复制" : "点击复制地址"}
        onClick={() => void copyAddress()}
      >
        {copied ? "已复制" : address}
      </AddressButton>
    </>
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
    multicallAddress: MULTICALL3,
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
