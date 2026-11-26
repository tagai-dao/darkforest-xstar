import { isLocatable } from "@df/gamelogic";
import type { Planet } from "@df/types";
import React from "react";

import { Link } from "../Components/CoreUI";
import dfstyles from "../Styles/dfstyles";
import { useUIManager } from "../Utils/AppHooks";
import UIEmitter, { UIEmitterEvent } from "../Utils/UIEmitter";

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
    <Link
      color={dfstyles.colors.text}
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
    </Link>
  );
}
