import { EMPTY_ADDRESS } from "@df/constants";
import { formatNumber, hasOwner, isLocatable } from "@df/gamelogic";
import { getOwnerColorVec } from "@df/procedural";
import type {
  MaterialType,
  Planet,
  QueuedArrival,
  RGBAVec,
  VoyageRendererType,
  WorldCoords,
} from "@df/types";
import {
  ArtifactType,
  RendererType,
  RenderZIndex,
  TextAlign,
  TextAnchor,
} from "@df/types";
import { getMaterialColor } from "@frontend/Panes/PlanetMaterialsPane";

import { engineConsts } from "../EngineConsts";
import { fleetRoutes, type FleetTier, getFleetTier } from "../FleetSprites";
import type { Renderer } from "../Renderer";
import type { GameGLManager } from "../WebGL/GameGLManager";

const { white, gold } = engineConsts.colors;
const { enemyA, mineA, shipA, supportA } = engineConsts.colors.voyage;

function getVoyageColor(
  fromPlanet: Planet,
  toPlanet: Planet,
  isMine: boolean,
  isShip: boolean,
  isSupport: boolean,
) {
  if (isMine) {
    return mineA;
  }

  if (isSupport) {
    return supportA;
  }

  const isAttack = hasOwner(toPlanet) && fromPlanet.owner !== toPlanet.owner;

  if (isAttack) {
    if (isShip) {
      return shipA;
    } else {
      return enemyA;
    }
  }

  return getOwnerColorVec(fromPlanet);
}

/* responsible for calling renderers in order to draw voyages */
export class VoyageRenderer implements VoyageRendererType {
  renderer: Renderer;
  private departureEnergy = new WeakMap<QueuedArrival, number>();

  rendererType = RendererType.Voyager;
  constructor(gl: GameGLManager) {
    this.renderer = gl.renderer;
  }

  private drawVoyage(
    voyage: QueuedArrival,
    isMyVoyage: boolean,
    isShipVoyage: boolean,
    isSupportVoyage: boolean,
    emphasis: number,
  ) {
    const {
      context: gameUIManager,
      circleRenderer: cR,
      textRenderer: tR,
      spriteRenderer: sR,
      planetRenderManager: pRM,
    } = this.renderer;

    const fromLoc = gameUIManager.getLocationOfPlanet(voyage.fromPlanet);
    const fromPlanet = gameUIManager.getPlanetWithId(voyage.fromPlanet);
    const toLoc = gameUIManager.getLocationOfPlanet(voyage.toPlanet);
    const toPlanet = gameUIManager.getPlanetWithId(voyage.toPlanet);

    if (!fromPlanet || !toLoc || !toPlanet) return;

    const { proportion, timeLeft } = this.getVoyageTiming(voyage);
    const color = getVoyageColor(
      fromPlanet,
      toPlanet,
      isMyVoyage,
      isShipVoyage,
      isSupportVoyage,
    );
    const emphasized = emphasis > 0;

    if (!fromLoc) {
      const text = isShipVoyage ? "Ship" : formatNumber(voyage.energyArriving);
      if (timeLeft !== undefined && timeLeft > 0) {
        const radius = (timeLeft * fromPlanet.speed) / 100;
        cR.queueCircleWorld(toLoc.coords, radius, color, 1, 1, true);
        tR.queueTextWorld(
          `${text} in ${timeLeft}s`,
          { x: toLoc.coords.x, y: toLoc.coords.y + radius },
          color,
          0,
          TextAlign.Center,
          TextAnchor.Bottom,
        );
      } else {
        tR.queueTextWorld(
          `${text} in --`,
          toLoc.coords,
          color,
          0,
          TextAlign.Center,
          TextAnchor.Bottom,
        );
      }
    } else {
      let departureEnergy = this.departureEnergy.get(voyage);
      if (
        departureEnergy === undefined &&
        !(isShipVoyage && voyage.energyArriving === 0) &&
        isLocatable(fromPlanet) &&
        isLocatable(toPlanet)
      ) {
        const estimate = gameUIManager.estimateVoyageDepartureEnergy(
          voyage,
          toPlanet,
        );
        if (Number.isFinite(estimate)) {
          departureEnergy = estimate;
          this.departureEnergy.set(voyage, estimate);
        }
      }

      const tier = getFleetTier(departureEnergy ?? voyage.energyArriving);
      this.drawVoyagePath(fromLoc.coords, toLoc.coords, color, tier, emphasis);

      const shipsLocation = this.getFleetPosition(
        fromLoc.coords,
        toLoc.coords,
        proportion,
      );
      const viewport = this.renderer.getViewport();
      const position = viewport.worldToCanvasCoords(shipsLocation);
      const { viewportWidth, viewportHeight } = viewport;
      const margin = 112;
      if (
        position.x < -margin ||
        position.y < -margin ||
        position.x > viewportWidth + margin ||
        position.y > viewportHeight + margin
      ) {
        return;
      }

      const origin = viewport.worldToCanvasCoords(fromLoc.coords);
      const destination = viewport.worldToCanvasCoords(toLoc.coords);
      const shortRoute =
        Math.hypot(destination.x - origin.x, destination.y - origin.y) < 8;
      let fleetRadius = 4;
      if (shortRoute) {
        cR.queueCircleWorldCenterOnly(shipsLocation, fleetRadius, color);
      } else {
        fleetRadius =
          this.renderer.overlay2dRenderer.drawFleetMarker(
            position,
            origin,
            destination,
            color,
            tier,
            emphasized,
            gameUIManager.getIsHighPerfMode(),
          ) ?? fleetRadius;
      }
      const alpha = emphasized ? 255 : 214;
      const artifactSizePixels = 20;
      if (voyage.artifactId) {
        const artifact = gameUIManager.getArtifactWithId(voyage.artifactId);
        if (artifact) {
          // const viewport = this.renderer.getViewport();
          const distanceFromCenterOfFleet =
            fleetRadius * 1.5 + artifactSizePixels;
          const x = distanceFromCenterOfFleet + position.x;
          const y = position.y;

          const k = 40;
          const size = (k * 20.0) / (1.0 * viewport.worldToCanvasDist(20));

          if (artifact.artifactType !== ArtifactType.Avatar) {
            sR.queueArtifact(artifact, { x, y }, artifactSizePixels);
          } else {
            pRM.queueArtifactImage(
              viewport.canvasToWorldCoords({ x, y }),
              size,
              artifact,
            );
          }
        }
      }

      // Leave a fixed screen-space gap around the fleet at every zoom.
      const above = viewport.canvasToWorldCoords({
        x: position.x,
        y: position.y - fleetRadius - 3,
      });
      const below = viewport.canvasToWorldCoords({
        x: position.x,
        y: position.y + fleetRadius + 3,
      });
      tR.queueTextWorld(
        timeLeft === undefined ? "--" : `${timeLeft}s`,
        below,
        [...white, alpha],
        0,
        TextAlign.Center,
        TextAnchor.Top,
      );
      let cargoRow = 0;
      if (voyage.energyArriving > 0) {
        tR.queueTextWorld(
          formatNumber(voyage.energyArriving),
          above,
          [...white, alpha],
          cargoRow--,
          TextAlign.Center,
          TextAnchor.Bottom,
        );
      }
      if (voyage.silverMoved > 0) {
        tR.queueTextWorld(
          formatNumber(voyage.silverMoved),
          above,
          [...gold, alpha],
          cargoRow--,
          TextAlign.Center,
          TextAnchor.Bottom,
        );
      }

      // Display materials if being moved
      if (voyage.materialsMoved && voyage.materialsMoved.length > 0) {
        for (const mat of voyage.materialsMoved) {
          const materialColor = getMaterialColor(
            mat.materialId as MaterialType,
          );
          // Convert hex color to RGB array
          const r = parseInt(materialColor.slice(1, 3), 16);
          const g = parseInt(materialColor.slice(3, 5), 16);
          const b = parseInt(materialColor.slice(5, 7), 16);

          tR.queueTextWorld(
            `${formatNumber(mat.materialAmount, 0)}`,
            above,
            [r, g, b, alpha],
            cargoRow--,
            TextAlign.Center,
            TextAnchor.Bottom,
          );
        }
      }
    }
  }

  private getVoyageTiming(voyage: QueuedArrival) {
    const { context, now, currentTick } = this.renderer;
    const departure = context.convertTickToMs(voyage.departureTick);
    const arrival = context.convertTickToMs(voyage.arrivalTick);
    const duration = arrival - departure;
    const wallClock = Number.isFinite(duration) && duration > 0;
    const tickDuration = voyage.arrivalTick - voyage.departureTick;
    let progress = 0;
    if (wallClock) progress = (now - departure) / duration;
    else if (tickDuration > 0)
      progress = (currentTick - voyage.departureTick) / tickDuration;
    return {
      proportion: Math.max(0.01, Math.min(0.99, progress)),
      timeLeft: wallClock
        ? Math.max(0, Math.ceil((arrival - now) / 1000))
        : undefined,
    };
  }

  private getFleetPosition(
    from: WorldCoords,
    to: WorldCoords,
    proportion: number,
  ): WorldCoords {
    return {
      x: from.x + (to.x - from.x) * proportion,
      y: from.y + (to.y - from.y) * proportion,
    };
  }

  queueVoyages(): void {
    const { context: gameUIManager, currentTick } = this.renderer;
    const voyages = gameUIManager.getAllVoyages();
    const account = gameUIManager.getAccount();
    const playerAddress = gameUIManager.getPlayer()?.address;
    const selectedVoyage = (
      gameUIManager as unknown as {
        getSelectedVoyage?: () => QueuedArrival | undefined;
      }
    ).getSelectedVoyage?.();
    const hoveredVoyage = (
      gameUIManager as unknown as {
        getHoveringVoyage?: () => QueuedArrival | undefined;
      }
    ).getHoveringVoyage?.();

    // Separate voyages into selected and unselected groups
    // This ensures selected voyages are drawn last and appear on top
    const unselectedVoyages: QueuedArrival[] = [];
    const selectedVoyages: QueuedArrival[] = [];

    for (const voyage of voyages) {
      if (currentTick < voyage.arrivalTick) {
        const isSelected = Boolean(
          selectedVoyage && selectedVoyage.eventId === voyage.eventId,
        );
        if (isSelected) {
          selectedVoyages.push(voyage);
        } else {
          unselectedVoyages.push(voyage);
        }
      } else {
        // this move arrived, apply it to target planet and remove it
        gameUIManager.updateArrival(voyage.toPlanet, voyage);
      }
    }

    for (const voyage of [...unselectedVoyages, ...selectedVoyages]) {
      const isMyVoyage =
        voyage.player === account ||
        (playerAddress !== undefined &&
          gameUIManager.getArtifactWithId(voyage.artifactId)?.controller ===
            playerAddress);
      const isShipVoyage = voyage.player === EMPTY_ADDRESS;
      const toPlanet = gameUIManager.getPlanetWithId(voyage.toPlanet);
      if (!toPlanet) continue;

      const isSupportVoyage =
        gameUIManager.inSameGuildAtTick(
          voyage.player,
          toPlanet.owner,
          voyage.arrivalTick,
        ) && voyage.player !== toPlanet.owner;

      const isSelected = selectedVoyage?.eventId === voyage.eventId;
      const isHovered = hoveredVoyage?.eventId === voyage.eventId;
      const emphasis = isSelected ? 1 : Number(isHovered) * 0.6;
      this.drawVoyage(
        voyage,
        isMyVoyage,
        isShipVoyage,
        isSupportVoyage,
        emphasis,
      );
    }

    for (const { intent } of gameUIManager.getUnconfirmedMoves()) {
      const origin = gameUIManager.getLocationOfPlanet(intent.from);
      const destination = gameUIManager.getLocationOfPlanet(intent.to);
      if (!origin || !destination) continue;

      this.drawVoyagePath(
        origin.coords,
        destination.coords,
        mineA,
        getFleetTier(intent.forces),
        0,
        false,
      );
    }
  }

  private drawVoyagePath(
    from: WorldCoords,
    to: WorldCoords,
    color: RGBAVec,
    tier: FleetTier,
    emphasis: number,
    confirmed = true,
  ) {
    const { width, alpha, halo, dash } = fleetRoutes[tier];
    const [r, g, b] = color;
    const { lineRenderer } = this.renderer;
    const z = RenderZIndex.Voyages;
    const routeWidth = width + Number(emphasis > 0);

    if (confirmed && (halo > 0 || emphasis > 0)) {
      lineRenderer.queueLineWorld(
        from,
        to,
        [r, g, b, Math.max(halo, Math.round(56 * emphasis))],
        routeWidth + 4,
        z,
      );
    }

    lineRenderer.queueLineWorld(
      from,
      to,
      [r, g, b, confirmed ? Math.round(alpha + (255 - alpha) * emphasis) : 100],
      routeWidth,
      z,
      confirmed ? dash : true,
    );
  }

  flush() {}

  /**
   * Gets voyage data for rendering UI components
   */
  getVoyageData() {
    const { context: gameUIManager, currentTick } = this.renderer;
    const voyages = gameUIManager.getAllVoyages();
    const account = gameUIManager.getAccount();
    const playerAddress = gameUIManager.getPlayer()?.address;
    const voyageData: Array<{
      voyage: QueuedArrival;
      position: { x: number; y: number };
      isMyVoyage: boolean;
      canRevert: boolean;
    }> = [];

    for (const voyage of voyages) {
      if (currentTick < voyage.arrivalTick) {
        const isMyVoyage =
          voyage.player === account ||
          (playerAddress !== undefined &&
            gameUIManager.getArtifactWithId(voyage.artifactId)?.controller ===
              playerAddress);

        const fromLoc = gameUIManager.getLocationOfPlanet(voyage.fromPlanet);
        const toLoc = gameUIManager.getLocationOfPlanet(voyage.toPlanet);

        if (fromLoc && toLoc) {
          const { proportion } = this.getVoyageTiming(voyage);
          const shipsLocation = this.getFleetPosition(
            fromLoc.coords,
            toLoc.coords,
            proportion,
          );

          // Check if can revert using proper logic
          let canRevert = false;
          if (isMyVoyage && proportion < 0.5) {
            // Check if the original source planet is still owned by the player
            const sourcePlanet = gameUIManager.getPlanetWithId(
              voyage.fromPlanet,
            );
            canRevert = Boolean(sourcePlanet && sourcePlanet.owner === account);
          }

          voyageData.push({
            voyage,
            position: shipsLocation,
            isMyVoyage,
            canRevert,
          });
        }
      }
    }

    return voyageData;
  }
}
