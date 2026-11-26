import styled from "styled-components";
import { formatEther } from "viem";

import { formatBuyJunkOrder } from "../../Backend/GameLogic/moveOrder";
import { useUIManager } from "../Utils/AppHooks";
import {
  GameListPanel,
  ListButton,
  ListEmpty,
  ListTable,
} from "./GameListPanel";
import { junkTierQuotes } from "./junkTiers";

const Hint = styled.p`
  margin: 0;
  padding: 10px 14px;
  border-bottom: 1px solid #28394e;
  color: #a9bdd5;
`;

const QuoteTable = styled(ListTable)`
  th,
  td {
    text-align: right;
  }

  th:last-child,
  td:last-child {
    text-align: center;
  }
`;

const Owned = styled.span`
  color: #a9bdd5;
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
    <GameListPanel
      title="购买垃圾额度"
      count={
        junkLimit !== undefined
          ? `当前 ${junkLimit.toLocaleString("zh-CN")}`
          : undefined
      }
      width={450}
      onClose={onClose}
      guidePanel="buy-junk"
      toolbar={
        currentAllocation !== undefined && (
          <Hint>
            价格为升到该档所需的 BNB。点击购买后，将复制的命令粘贴给 agent。
          </Hint>
        )
      }
    >
      {currentAllocation === undefined ? (
        <ListEmpty>额度还没同步，请稍后再试。</ListEmpty>
      ) : (
        <QuoteTable>
          <table>
            <thead>
              <tr>
                <th scope="col">额度</th>
                <th scope="col">价格 (BNB)</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((quote) => (
                <tr key={quote.allocation}>
                  <td>{quote.limit.toLocaleString("zh-CN")}</td>
                  <td>{quote.owned ? "—" : formatEther(quote.priceWei)}</td>
                  <td>
                    {quote.owned ? (
                      <Owned>已拥有</Owned>
                    ) : (
                      <ListButton
                        type="button"
                        data-guide-target="buy-junk-tier"
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
                      </ListButton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </QuoteTable>
      )}
    </GameListPanel>
  );
}
