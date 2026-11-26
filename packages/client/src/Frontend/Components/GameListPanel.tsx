import { type ReactNode, useId } from "react";
import styled from "styled-components";

const Shell = styled.section<{ $width: number }>`
  position: fixed;
  top: 52px;
  left: 16px;
  z-index: 7;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: min(${({ $width }) => $width}px, calc(100vw - 32px));
  max-height: min(72dvh, calc(100dvh - 68px));
  overflow: hidden;
  background: linear-gradient(155deg, rgb(19 32 51 / 99%), rgb(10 17 29 / 99%));
  border: 1px solid #2b4058;
  border-radius: 9px;
  box-shadow: 0 12px 32px rgb(2 5 12 / 48%);
  color: #dce8f6;
  font:
    13px / 1.5 system-ui,
    "PingFang SC",
    sans-serif;
  font-variant-numeric: tabular-nums;

  @media (min-width: 760px) {
    max-width: calc(100vw - 370px);
  }
`;

export const ListButton = styled.button`
  padding: 4px 9px;
  background: #15273d;
  border: 1px solid #324c68;
  border-radius: 5px;
  color: #b7e7fc;
  font: inherit;
  white-space: nowrap;
  cursor: pointer;

  &:hover:enabled {
    background: #203b55;
    color: #edfbff;
  }

  &:focus-visible {
    outline: 2px solid #8bdfff;
    outline-offset: 1px;
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
  border-bottom: 1px solid #28394e;

  h2 {
    margin: 0;
    color: #f2f7ff;
    font: inherit;
    font-size: 15px;
    font-weight: 700;
  }

  span {
    color: #9cb2c9;
    font-size: 12px;
  }

  ${ListButton} {
    margin-left: auto;
  }
`;

const Body = styled.div`
  min-height: 0;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: #3d5672 transparent;
  overscroll-behavior: contain;
`;

export const ListTable = styled.div<{ $minWidth?: number }>`
  --sortable-table-header-background: #17283d;

  table {
    width: 100%;
    min-width: ${({ $minWidth }) => $minWidth ?? 0}px;
    overflow: visible;
    border-collapse: separate;
    border-spacing: 0;
  }

  thead {
    position: sticky;
    top: 0;
    z-index: 3;
    background: var(--sortable-table-header-background);
  }

  th {
    padding: 8px 12px;
    border-bottom: 1px solid #334961;
    color: #a9c0d9;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
  }

  td {
    padding: 10px 12px;
    border-bottom: 1px solid rgb(126 166 206 / 14%);
    vertical-align: middle;
  }

  tbody tr:nth-child(even) {
    background: rgb(99 146 190 / 5%);
  }

  tbody tr:hover,
  tbody tr:focus-within {
    background: rgb(114 168 219 / 12%);
  }

  tbody tr:last-child td {
    border-bottom: 0;
  }

  button[data-planet-link] {
    color: #b5e9ff;
    font-weight: 650;
    text-underline-offset: 3px;
  }
`;

export const ListEmpty = styled.p`
  margin: 0;
  padding: 26px 14px;
  color: #a9bbd1;
  text-align: center;
`;

export function GameListPanel({
  title,
  count,
  width,
  onClose,
  guidePanel,
  guideClose,
  toolbar,
  children,
}: {
  title: string;
  count?: string;
  width: number;
  onClose: () => void;
  guidePanel?: string;
  guideClose?: string;
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  const titleId = useId();

  return (
    <Shell
      $width={width}
      aria-labelledby={titleId}
      data-guide-panel={guidePanel}
    >
      <Header>
        <h2 id={titleId}>{title}</h2>
        {count && <span>{count}</span>}
        <ListButton
          data-guide-target={guideClose}
          type="button"
          onClick={onClose}
        >
          关闭
        </ListButton>
      </Header>
      {toolbar}
      <Body>{children}</Body>
    </Shell>
  );
}
