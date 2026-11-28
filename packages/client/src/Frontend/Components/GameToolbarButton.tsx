import { Link } from "react-router-dom";
import styled, { css } from "styled-components";

const toolbarButton = css`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 5px 10px;
  border: 1px solid #385470;
  border-radius: 5px;
  background: #132438;
  color: #dbedff;
  font:
    13px/1.5 system-ui,
    "PingFang SC",
    sans-serif;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: #1d3854;
  }

  &:focus-visible {
    outline: 2px solid #8ce0ff;
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.55;
    cursor: default;
  }
`;

export const GameToolbarButton = styled.button`
  ${toolbarButton}
`;

export const GameToolbarLink = styled(Link)`
  ${toolbarButton}
`;
