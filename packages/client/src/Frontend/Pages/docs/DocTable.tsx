import styled from "styled-components";

export const DocTableFrame = styled.div`
  margin: 16px 0 22px;
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: #52657a #111a28;
  border: 1px solid var(--doc-border);
  border-radius: 8px;
  background: #101824;

  &::-webkit-scrollbar {
    display: block;
    height: 8px;
  }

  &::-webkit-scrollbar-thumb {
    border-radius: 4px;
    background: #52657a;
  }
`;

export const DocTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  color: var(--doc-text);
  font-size: 14px;
  line-height: 1.6;

  th,
  td {
    padding: 10px 14px;
    border-bottom: 1px solid var(--doc-border);
    text-align: left;
    vertical-align: top;
  }

  thead th {
    background: #1a2535;
    color: var(--doc-heading);
    font-weight: 650;
  }

  tbody th {
    color: var(--doc-heading);
    font-weight: 600;
  }

  tbody tr:nth-child(even) {
    background: #131e2c;
  }

  tbody tr:last-child > * {
    border-bottom: 0;
  }

  [data-numeric] {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  tbody [data-numeric] {
    white-space: nowrap;
  }

  @media (max-width: 600px) {
    th,
    td {
      padding: 9px 10px;
    }
  }
`;
