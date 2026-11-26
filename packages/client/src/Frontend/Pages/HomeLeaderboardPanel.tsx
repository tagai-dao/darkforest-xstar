import { useState } from "react";
import styled from "styled-components";
import dfstyles from "../Styles/dfstyles";
import {
  displayMetric,
  displayPlayerName,
  type HomeBoardMode,
  type HomeBoards,
  type HomeBoardRow,
  metricOf,
} from "./homeLeaderboard";

const Panel = styled.div<{ $framed: boolean }>`
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
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
    width: 42px;
    text-align: right;
    white-space: nowrap;
  }

  th:nth-child(2),
  td:nth-child(2) {
    width: auto;
    overflow-wrap: anywhere;
  }

  th:nth-child(n + 3),
  td:nth-child(n + 3) {
    width: clamp(64px, 11vw, 120px);
    text-align: right;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
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

const BoardScroll = styled.div`
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;

  @media (max-width: 720px) {
    max-height: 340px;
  }
`;

const BoardFooter = styled.div`
  margin-top: auto;
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
  boards?: HomeBoards;
  handles?: ReadonlyMap<string, string>;
  /** 预览条数；不传则显示全部。 */
  previewLimit?: number;
  /** false 时去掉外边框，嵌进「游戏数据」卡片。 */
  framed?: boolean;
  showTitle?: boolean;
};

export function HomeLeaderboardPanel({
  boards,
  handles,
  previewLimit,
  framed = true,
  showTitle = true,
}: Props) {
  // 首页预览固定分数榜；弹窗里才切换分数 / 击杀。
  const [modalMode, setModalMode] = useState<HomeBoardMode>("score");
  const [open, setOpen] = useState(false);

  const withName = (rows: HomeBoardRow[]) =>
    rows.map((row) => ({
      ...row,
      name: displayPlayerName(
        row.address,
        handles?.get(row.address.toLowerCase()),
      ),
    }));
  const scoreRows = withName(boards?.score ?? []);
  const killRows = withName(boards?.kills ?? []);
  let status = "";
  if (!boards) status = "正在读取";
  else if (boards.unavailable) status = "排行榜读不到";
  else if (scoreRows.length === 0) status = "还没有上榜的玩家";

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
          <BoardScroll>
            <BoardTable mode="score" rows={preview} variant="preview" />
          </BoardScroll>
        )}
        {showMore && (
          <BoardFooter>
            <MoreButton type="button" onClick={() => setOpen(true)}>
              查看完整排行榜
            </MoreButton>
          </BoardFooter>
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
          <th scope="col">名次</th>
          <th scope="col">玩家</th>
          <th scope="col">{mode === "score" ? "分数" : "击杀"}</th>
          {variant === "preview" && <th scope="col">击杀</th>}
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
            {variant === "preview" && <td>{displayMetric(row.kills)}</td>}
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
