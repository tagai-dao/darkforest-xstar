import { Link } from "react-router-dom";
import styled from "styled-components";

import dfstyles from "../../Styles/dfstyles";

const Button = styled(Link).withConfig({
  shouldForwardProp: (prop) => String(prop) !== "$fixed",
})<{ $fixed: boolean }>`
  position: ${(props) => (props.$fixed ? "fixed" : "absolute")};
  top: 12px;
  right: 16px;
  z-index: 40;
  padding: 8px 12px;
  border: 1px solid ${dfstyles.colors.dfgreen};
  background: rgba(0, 0, 0, 0.82);
  color: ${dfstyles.colors.dfgreen};
  font-family: "Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif;
  font-size: 14px;
  text-decoration: none;
`;

export function DocsCorner({ fixed = false }: { fixed?: boolean }) {
  return (
    <Button to="/docs/overview" $fixed={fixed}>
      文档
    </Button>
  );
}
