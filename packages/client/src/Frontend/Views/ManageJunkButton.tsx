import { EMPTY_ADDRESS } from "@df/constants";
import { isLocatable } from "@df/gamelogic";
import { isUnconfirmedAddJunkTx, isUnconfirmedClearJunkTx } from "@df/serde";
import type { Planet } from "@df/types";
import { useCallback, useMemo } from "react";
import styled from "styled-components";

import {
  copyText,
  formatAddJunkOrder,
  formatClearJunkOrder,
} from "../../Backend/GameLogic/moveOrder";
import type { Wrapper } from "../../Backend/Utils/Wrapper";
import { LoadingSpinner } from "../Components/LoadingSpinner";
import { MaybeShortcutButton } from "../Components/MaybeShortcutButton";
import { useUIManager } from "../Utils/AppHooks";
import UIEmitter, { UIEmitterEvent } from "../Utils/UIEmitter";
import { TOGGLE_MANAGE_JUNK } from "../Utils/ShortcutConstants";

const TextWrapper = styled.span`
  text-align: center;
  display: block;
  width: 100%;
`;

const ButtonContainer = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  margin-top: 4px;
  margin-bottom: 4px;
`;

export function ManageJunkButton({
  wrapper,
}: {
  wrapper: Wrapper<Planet | undefined>;
}) {
  const uiManager = useUIManager();
  const planet = wrapper.value;
  const account = uiManager.getAccount();

  const preAddJunkCheck = useMemo(() => {
    if (!planet) {
      return;
    }
    if (planet.junkOwner === EMPTY_ADDRESS && planet.owner === account)
      return true;
    else if (planet.owner === account && planet.junkOwner !== account)
      return true;
    else return false;
  }, [planet, account]);

  // 页面不登记。复制登记单，agent 读到后证明并调用 df__addJunk。
  const addJunk = useCallback(() => {
    if (!planet || !isLocatable(planet)) {
      return;
    }
    const hashConfig = uiManager.getHashConfig();
    const text = formatAddJunkOrder({
      planetId: planet.locationId,
      x: planet.location.coords.x,
      y: planet.location.coords.y,
      biomebase: planet.location.biomebase,
      planetHashKey: hashConfig.planetHashKey,
      biomebaseKey: hashConfig.biomebaseKey,
      scale: hashConfig.perlinLengthScale,
      mirrorX: hashConfig.perlinMirrorX,
      mirrorY: hashConfig.perlinMirrorY,
      entryFeeWei: uiManager.getGameManager().getTransactionFee(),
    });
    void copyText(text).then((copied) => {
      UIEmitter.getInstance().emit(UIEmitterEvent.MoveOrderCopied, {
        text,
        copied,
        label: "已复制登记单，直接粘贴给 agent",
      });
    });
  }, [planet, uiManager]);

  const adding = useMemo(
    () => !!wrapper.value?.transactions?.hasTransaction(isUnconfirmedAddJunkTx),
    [wrapper],
  );

  const preClearJunkCheck = useMemo(() => {
    if (!planet) {
      return;
    }
    return planet.junkOwner === account;
  }, [planet]);

  // 页面不清除。复制清除单，agent 读到后直接调用 df__clearJunk。
  const clearJunk = useCallback(() => {
    if (!planet) {
      return;
    }
    const text = formatClearJunkOrder({
      planetId: planet.locationId,
      ownsPlanet: planet.owner.toLowerCase() === account?.toLowerCase(),
      entryFeeWei: uiManager.getGameManager().getTransactionFee(),
    });
    void copyText(text).then((copied) => {
      UIEmitter.getInstance().emit(UIEmitterEvent.MoveOrderCopied, {
        text,
        copied,
        label: "已复制清除单，直接粘贴给 agent",
      });
    });
  }, [planet, uiManager, account]);

  const clearing = useMemo(
    () =>
      !!wrapper.value?.transactions?.hasTransaction(isUnconfirmedClearJunkTx),
    [wrapper],
  );

  const handleAction = () => {
    if (preAddJunkCheck) {
      addJunk();
    } else if (preClearJunkCheck) {
      clearJunk();
    }
  };

  if (!preAddJunkCheck && !preClearJunkCheck) {
    return null;
  } else {
    return (
      <ButtonContainer>
        <MaybeShortcutButton
          size="stretch"
          shortcutKey={TOGGLE_MANAGE_JUNK}
          shortcutText={TOGGLE_MANAGE_JUNK}
          onClick={handleAction}
          onShortcutPressed={handleAction}
          disabled={adding || clearing}
        >
          {preAddJunkCheck && (
            <TextWrapper>
              {adding ? (
                <LoadingSpinner initialText="Adding Junk..." />
              ) : (
                "登记"
              )}
            </TextWrapper>
          )}

          {preClearJunkCheck && (
            <TextWrapper>
              {clearing ? (
                <LoadingSpinner initialText="Clearing Junk..." />
              ) : (
                "取消登记"
              )}
            </TextWrapper>
          )}
        </MaybeShortcutButton>
      </ButtonContainer>
    );
  }
}
