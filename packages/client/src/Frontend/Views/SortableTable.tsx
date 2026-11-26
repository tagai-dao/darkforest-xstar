import React, { useCallback, useState } from "react";
import styled from "styled-components";

import dfstyles from "../Styles/dfstyles";
import { Table } from "./Table";

const TableCell = styled.div`
  padding: 2px 4px;
`;

const Header = styled.div`
  padding: 2px 4px;
`;

const SortButton = styled.button`
  padding: 0;
  background: none;
  border: 0;
  color: inherit;
  font: inherit;
  user-select: none;
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }

  &:focus-visible {
    outline: 1px solid #8bdfff;
    outline-offset: 2px;
  }
`;

const HeaderInner = styled.span<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: ${({ $active }) => ($active ? "bold" : "normal")};
`;

// 表头旁边的双向箭头。点中后，当前方向用亮色。
function SortIcon({ active, reverse }: { active: boolean; reverse: boolean }) {
  const up = active && !reverse ? "#e8eef7" : "#6d7b8c";
  const down = active && reverse ? "#e8eef7" : "#6d7b8c";
  return (
    <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden="true">
      <path d="M5 1 L8.5 5 H1.5 Z" fill={up} />
      <path d="M5 11 L1.5 7 H8.5 Z" fill={down} />
    </svg>
  );
}

export function SortableTable<T>({
  rows,
  headers,
  columns,
  sortFunctions,
  alignments,
  paginated,
  sortable,
  getRowKey,
}: {
  rows: T[];
  headers: React.ReactNode[];
  columns: Array<(t: T, i: number) => React.ReactNode>;
  sortFunctions: Array<(left: T, right: T) => number>;
  alignments?: Array<"r" | "c" | "l">;
  paginated?: boolean;
  // 没有标题，或明确标成不可排序的列，不画排序图标。
  sortable?: boolean[];
  getRowKey?: (row: T) => React.Key;
}): JSX.Element {
  const [sortByColumn, setSortByColumn] = useState<number | undefined>(
    undefined,
  );
  const [reverse, setReverse] = useState(false);
  const sortFn =
    sortByColumn !== undefined ? sortFunctions[sortByColumn] : undefined;
  const sortedRows = [...rows];

  if (sortFn !== undefined) {
    sortedRows.sort((a, b) => {
      if (reverse) {
        return sortFn(b, a);
      } else {
        return sortFn(a, b);
      }
    });
  }

  // when you click on a column, cycle between three states:
  // 1) sort by that column
  // 2) sort by the reverse of that column
  // 3) sort by nothing
  const onColumnTitleClicked = useCallback(
    (columnIndex: number) => {
      if (sortByColumn === columnIndex) {
        if (reverse) {
          setReverse(false);
          setSortByColumn(undefined);
        } else {
          setReverse(true);
        }
      } else {
        setSortByColumn(columnIndex);
        setReverse(false);
      }
    },
    [sortByColumn, reverse],
  );

  return (
    <Table<T>
      paginated={paginated}
      headerStyle={{
        backgroundColor: `var(--sortable-table-header-background, ${dfstyles.colors.background})`,
        position: "sticky",
        top: 0,
      }}
      rows={sortedRows}
      getRowKey={getRowKey}
      headers={headers.map((originalHeader, i) => {
        const active = sortByColumn === i;
        const canSort =
          Boolean(sortFunctions[i]) &&
          sortable?.[i] !== false &&
          originalHeader !== "" &&
          originalHeader !== undefined &&
          originalHeader !== null;
        return (
          <Header key={i}>
            {canSort ? (
              <SortButton
                type="button"
                aria-pressed={active}
                onClick={() => onColumnTitleClicked(i)}
              >
                <HeaderInner $active={active}>
                  {originalHeader}
                  <SortIcon active={active} reverse={reverse} />
                </HeaderInner>
              </SortButton>
            ) : (
              originalHeader
            )}
          </Header>
        );
      })}
      columns={columns.map(
        (originalColumn) =>
          function Column(t: T, i: number) {
            return <TableCell>{originalColumn(t, i)}</TableCell>;
          },
      )}
      alignments={alignments}
    />
  );
}
