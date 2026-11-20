import styled from "styled-components";
import { formatEther } from "viem";

import { formatBuyJunkOrder } from "../../Backend/GameLogic/moveOrder";
import dfstyles from "../Styles/dfstyles";
import { useUIManager } from "../Utils/AppHooks";
import { junkTierQuotes } from "./junkTiers";

const Shell = styled.div`
  position: fixed;
  top: 16px;
  left: 16px;
  z-index: 7;
  width: min(420px, calc(100vw - 420px));
  max-height: calc(100vh - 32px);
  overflow: auto;
  padding: 12px;
  background: ${dfstyles.colors.background};
  color: ${dfstyles.colors.text};
  border: 1px solid ${dfstyles.colors.borderDark};
`;

const TitleRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
`;

const Hint = styled.div`
  margin-bottom: 8px;
  opacity: 0.8;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;

  th,
  td {
    padding: 4px 6px;
    text-align: right;
    border-bottom: 1px solid ${dfstyles.colors.borderDark};
  }

  th:last-child,
  td:last-child {
    text-align: center;
  }
`;

const ActionButton = styled.button`
  cursor: pointer;
  color: ${dfstyles.colors.text};
  background: transparent;
  border: 1px solid ${dfstyles.colors.borderDark};
  padding: 4px 8px;

  &:disabled {
    cursor: default;
    opacity: 0.5;
  }
`;

/**
 * 购买垃圾额度的价格弹窗。
 * 每一档的按钮把对应的购买命令复制出来，粘贴给 agent 就会发出这笔购买。
 * 价格用链上读到的配置计算，和合约扣的钱一致。
 */
export function BuyJunkOrderPanel({
  junkLimit,
  onCopy,
  onClose,
}: {
  /** 这只钱包现在的额度上限。链上存的是档位乘以 1000。 */
  junkLimit: number | undefined;
  onCopy: (text: string, label: string) => void;
  onClose: () => void;
}) {
  const uiManager = useUIManager();
  const game = uiManager.getGameManager();

  const currentAllocation =
    junkLimit === undefined ? undefined : Math.round(junkLimit / 1000);
  const quotes =
    currentAllocation === undefined
      ? []
      : junkTierQuotes(currentAllocation, (allocation) =>
          game.getBuyJunkFee(allocation),
        );

  return (
    <Shell>
      <TitleRow>
        <div>购买垃圾额度</div>
        <ActionButton type="button" onClick={onClose}>
          关闭
        </ActionButton>
      </TitleRow>
      {currentAllocation === undefined ? (
        <div>额度还没同步，请稍后再试。</div>
      ) : (
        <>
          <Hint>
            当前额度 {junkLimit?.toLocaleString("zh-CN")}
            。价格是从当前额度升到该档要付的 BNB，点购买会复制命令，粘贴给 agent
            即可。
          </Hint>
          <Table>
            <thead>
              <tr>
                <th>额度</th>
                <th>价格 (BNB)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {quotes.map((quote) => (
                <tr key={quote.allocation}>
                  <td>{quote.limit.toLocaleString("zh-CN")}</td>
                  <td>
                    {quote.owned ? "已拥有" : formatEther(quote.priceWei)}
                  </td>
                  <td>
                    <ActionButton
                      type="button"
                      disabled={quote.owned}
                      onClick={() =>
                        onCopy(
                          formatBuyJunkOrder({
                            currentAllocation,
                            allocation: quote.allocation,
                            valueWei: quote.priceWei,
                          }),
                          `已复制购买 ${quote.limit.toLocaleString("zh-CN")} 额度的命令，直接粘贴给 agent`,
                        )
                      }
                    >
                      购买
                    </ActionButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      )}
    </Shell>
  );
}
