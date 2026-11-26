import { isLocatable } from "@df/gamelogic";
import type { Planet } from "@df/types";
import React from "react";
import styled from "styled-components";

import dfstyles from "../Styles/dfstyles";
import { useUIManager } from "../Utils/AppHooks";
import UIEmitter, { UIEmitterEvent } from "../Utils/UIEmitter";

const FocusButton = styled.button`
  padding: 0;
  border: 0;
  background: none;
  color: ${dfstyles.colors.text};
  font: inherit;
  text-align: left;
  text-decoration: underline;
  cursor: pointer;

  &:hover {
    color: #eaf7ff;
  }

  &:focus-visible {
    outline: 1px solid #8bdfff;
    outline-offset: 2px;
  }
`;

export function PlanetLink({
  planet,
  children,
  guideTarget,
}: {
  planet: Planet;
  children: React.ReactNode;
  guideTarget?: boolean;
}) {
  const uiManager = useUIManager();
  const uiEmitter = UIEmitter.getInstance();

  return (
    <FocusButton
      type="button"
      data-planet-link=""
      data-guide-planet={guideTarget ? planet.locationId : undefined}
      onClick={() => {
        if (isLocatable(planet)) {
          uiManager?.setSelectedPlanet(planet);
          uiEmitter.emit(UIEmitterEvent.CenterPlanet, planet);
        }
      }}
      onMouseEnter={() => {
        if (isLocatable(planet)) {
          uiManager?.setHoveringOverPlanet(planet, false);
        }
      }}
      onMouseLeave={() => {
        uiManager?.setHoveringOverPlanet(undefined, false);
      }}
    >
      {children}
    </FocusButton>
  );
}
