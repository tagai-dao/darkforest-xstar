import React, { useEffect, useState } from "react";
import styled from "styled-components";

import { DFZIndex } from "../Utils/constants";
import UIEmitter, { UIEmitterEvent } from "../Utils/UIEmitter";

type CopiedMove = {
  text: string;
  copied: boolean;
  label?: string;
};

/**
 * 拖动结束后告诉用户：出兵单已经在剪贴板里，可以直接粘贴给 agent。
 */
export function MoveOrderNotice() {
  const [notice, setNotice] = useState<CopiedMove | undefined>();

  useEffect(() => {
    const emitter = UIEmitter.getInstance();
    const show = (next: CopiedMove) => {
      setNotice(next);
    };
    emitter.on(UIEmitterEvent.MoveOrderCopied, show);
    return () => {
      emitter.off(UIEmitterEvent.MoveOrderCopied, show);
    };
  }, []);

  useEffect(() => {
    if (!notice?.copied) {
      return;
    }
    const timer = window.setTimeout(() => setNotice(undefined), 2500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (!notice) {
    return null;
  }

  return (
    <Toast>
      {notice.copied ? (
        <Line>{notice.label ?? "已复制出兵单，直接粘贴给 agent"}</Line>
      ) : (
        <>
          <Line>复制失败，请手动复制下面这段</Line>
          <Order value={notice.text} readOnly />
        </>
      )}
    </Toast>
  );
}

const Toast = styled.div`
  position: fixed;
  left: 50%;
  bottom: 24px;
  z-index: ${DFZIndex.Tooltip};
  transform: translateX(-50%);
  width: min(520px, calc(100vw - 32px));
  padding: 12px 14px;
  background: rgba(8, 12, 18, 0.94);
  border: 1px solid #3d4d63;
  color: #e8eef7;
`;

const Line = styled.div`
  font-size: 13px;
`;

const Order = styled.textarea`
  width: 100%;
  height: 120px;
  margin-top: 8px;
  box-sizing: border-box;
  color: inherit;
  background: transparent;
  border: 1px solid #3d4d63;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
`;
