import { isUnconfirmedWithdrawSilverTx } from "@df/serde";
import {
  copyText,
  formatWithdrawSilverOrder,
} from "../../Backend/GameLogic/moveOrder";
import type { Planet } from "@df/types";
import { PlanetType, TooltipName } from "@df/types";
import React, { useCallback, useMemo, useState } from "react";
import styled from "styled-components";

import type { Hook } from "../../_types/global/GlobalTypes";
import type { Wrapper } from "../../Backend/Utils/Wrapper";
import { Btn } from "../Components/Btn";
import { CenterBackgroundSubtext } from "../Components/CoreUI";
import type { DarkForestNumberInput } from "../Components/Input";
import { NumberInput } from "../Components/Input";
import { LoadingSpinner } from "../Components/LoadingSpinner";
import { Row } from "../Components/Row";
import { Red } from "../Components/Text";
import { TooltipTrigger } from "../Panes/Tooltip";
import dfstyles from "../Styles/dfstyles";
import { useUIManager } from "../Utils/AppHooks";
import UIEmitter, { UIEmitterEvent } from "../Utils/UIEmitter";

const StyledSilverInput = styled.div`
  width: fit-content;
  display: inline-flex;
  flex-direction: row;
  align-items: center;
`;

const MinBtn = styled.div`
  margin-right: 0.5em;
  color: ${dfstyles.colors.subtext};
  font-size: ${dfstyles.fontSizeS};
  &:hover {
    cursor: pointer;
    text-decoration: underline;
  }
`;

const AllBtn = styled.div`
  color: ${dfstyles.colors.subtext};
  font-size: ${dfstyles.fontSizeS};
  &:hover {
    cursor: pointer;
    text-decoration: underline;
  }
`;

const InputWrapper = styled.div`
  width: 5em;
  margin-right: 0.5em;
`;

function SilverInput({
  amt,
  setAmt,
  wrapper,
}: {
  amt: number | undefined;
  setAmt: Hook<number | undefined>[1];
  wrapper: Wrapper<Planet | undefined>;
}) {
  const clickMin = useCallback(() => {
    if (wrapper.value) {
      const silverMin = Math.floor(wrapper.value.silverCap * 0.2);
      setAmt(silverMin);
    }
  }, [wrapper, setAmt]);

  const clickAll = useCallback(() => {
    if (wrapper.value) {
      setAmt(wrapper.value.silver);
    }
  }, [wrapper, setAmt]);

  return (
    <StyledSilverInput>
      <InputWrapper>
        <NumberInput
          onChange={(e: Event & React.ChangeEvent<DarkForestNumberInput>) =>
            setAmt(e.target.value)
          }
          value={amt}
        />
      </InputWrapper>
      <MinBtn onClick={clickMin}>min </MinBtn>
      <AllBtn onClick={clickAll}>all </AllBtn>
    </StyledSilverInput>
  );
}

const TextWrapper = styled.span`
  width: 140px;
  font-size: ${dfstyles.fontSizeXS};
  text-align: center;
`;

export function WithdrawSilver({
  wrapper,
}: {
  wrapper: Wrapper<Planet | undefined>;
}) {
  const uiManager = useUIManager();

  const [error, setError] = useState<boolean>(false);
  const [amt, setAmt] = useState<number | undefined>(0);

  // 页面不发送提取。复制银换分单，agent 读到后直接调用 df__withdrawSilver。
  const withdraw = useCallback(
    (silver: number | undefined) => {
      if (!wrapper.value || typeof silver !== "number" || silver <= 0) {
        setError(true);
        return;
      }
      const text = formatWithdrawSilverOrder({
        planetId: wrapper.value.locationId,
        displayAmount: silver,
        entryFeeWei: uiManager.getGameManager().getTransactionFee(),
      });
      void copyText(text).then((copied) => {
        UIEmitter.getInstance().emit(UIEmitterEvent.MoveOrderCopied, {
          text,
          copied,
          label: "已复制银换分单，直接粘贴给 agent",
        });
      });
      setAmt(0);
    },
    [wrapper, uiManager],
  );

  const withdrawing = useMemo(
    () =>
      !!wrapper.value?.transactions?.hasTransaction(
        isUnconfirmedWithdrawSilverTx,
      ),
    [wrapper],
  );
  const empty = useMemo(
    () => !!(wrapper.value && wrapper.value.silver < 1),
    [wrapper],
  );
  const enough = useMemo(
    () =>
      !!(
        wrapper.value &&
        amt &&
        wrapper.value.silver >= Math.ceil(wrapper.value.silverCap * 0.2) &&
        amt >= Math.ceil(wrapper.value.silverCap * 0.2)
      ),
    [wrapper, amt],
  );

  if (wrapper.value?.planetType === PlanetType.TRADING_POST) {
    const minimum = Math.ceil(wrapper.value.silverCap * 0.2);
    const buttonLabel = enough
      ? "复制换分"
      : `Need at least ${minimum} silver to withdraw`;
    return (
      <>
        {error && (
          <Row>
            <Red>Error with amount entered.</Red>
          </Row>
        )}
        <Row>
          <SilverInput amt={amt} setAmt={setAmt} wrapper={wrapper} />
          <TooltipTrigger name={TooltipName.WithdrawSilverButton}>
            <Btn
              onClick={() => withdraw(amt)}
              disabled={withdrawing || empty || !enough}
            >
              <TextWrapper>
                {withdrawing && enough ? (
                  <LoadingSpinner initialText="Withdrawing..." />
                ) : (
                  buttonLabel
                )}
              </TextWrapper>
            </Btn>
          </TooltipTrigger>
        </Row>
      </>
    );
  } else {
    return (
      <CenterBackgroundSubtext width="100%" height="75px">
        Select a Spacetime Rip
      </CenterBackgroundSubtext>
    );
  }
}
