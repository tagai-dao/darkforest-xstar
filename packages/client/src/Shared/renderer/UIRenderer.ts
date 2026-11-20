import { getRange, isLocatable } from "@df/gamelogic";
import { isUnconfirmedMoveTx } from "@df/serde";
import type { Planet, RGBVec, UIRendererType, WorldCoords } from "@df/types";
import {
  ArtifactType,
  RendererType,
  RenderZIndex,
  TextAlign,
  TextAnchor,
} from "@df/types";

import { engineConsts } from "./EngineConsts";
import type { Renderer } from "./Renderer";
import type { GameGLManager } from "./WebGL/GameGLManager";

const { orangeA, red, redA, white, whiteA, purpleA, blueA, pinkA, sensaichaA } =
  engineConsts.colors;

export class UIRenderer implements UIRendererType {
  renderer: Renderer;

  rendererType = RendererType.UI;

  constructor(gl: GameGLManager) {
    this.renderer = gl.renderer;
  }

  queueBorders() {
    const { circleRenderer, context: gameUIManager } = this.renderer;
    const radius = gameUIManager.getWorldRadius();
    whiteA[3] = 255;
    circleRenderer.queueCircleWorld({ x: 0, y: 0 }, radius, whiteA, 2);
    const innerRadius = gameUIManager.getInnerRadius();
    circleRenderer.queueCircleWorld({ x: 0, y: 0 }, innerRadius, whiteA, 2);
  }

  /**
   * 粉红炸弹的预览：
   * - 射程圈：虚线，样式和星球的射程圈一致，大小随炸弹星球当前的能量变化；
   * - 炸毁线：从炸弹星球到目标，够不到时变红；
   * - 摧毁半径圈：以目标为圆心，到达后这个范围内的星球都能摧毁。
   */
  queueBombPreview() {
    const {
      context: uiManager,
      circleRenderer: cR,
      lineRenderer: lR,
      textRenderer: tR,
    } = this.renderer;
    this.queueBombVictimMark();

    const preview = uiManager.getBombPreview();
    if (!preview) return;

    const { from, reachRadius, target } = preview;
    // 能量太少时射程为 0，没东西可画
    if (reachRadius > 1) {
      cR.queueCircleWorld(from, reachRadius, pinkA, 1, 1, true);
      tR.queueTextWorld(
        `Bomb ${Math.round(reachRadius)}`,
        { x: from.x, y: from.y + reachRadius },
        pinkA,
        0,
        TextAlign.Center,
        TextAnchor.Bottom,
      );
    }

    if (target) {
      const lineColor = target.inReach ? pinkA : redA;
      lR.queueLineWorld(
        from,
        target.coords,
        lineColor,
        2,
        RenderZIndex.Voyages,
        false,
      );
      cR.queueCircleWorld(
        target.coords,
        target.blastRadius,
        [255, 192, 203, 160],
        2,
      );
      // 在线的中点标出距离，够不到时多写一个提示
      tR.queueTextWorld(
        target.inReach
          ? `${Math.round(target.distance)}`
          : `${Math.round(target.distance)} Too far`,
        {
          x: (from.x + target.coords.x) / 2,
          y: (from.y + target.coords.y) / 2,
        },
        lineColor,
      );
    }
  }

  /** 已选中的受害星球：用红色实线圈住，并标上 Destroy，方便和面板里的选择对上。 */
  private queueBombVictimMark() {
    const {
      context: uiManager,
      circleRenderer: cR,
      textRenderer: tR,
    } = this.renderer;
    const victim = uiManager.getBombVictim();
    if (!victim) return;

    const radius = 2.3 * uiManager.getRadiusOfPlanetLevel(victim.planetLevel);
    cR.queueCircleWorld(victim.location.coords, radius, redA, 2);
    tR.queueTextWorld(
      "Destroy",
      {
        x: victim.location.coords.x,
        y: victim.location.coords.y + radius,
      },
      redA,
      0,
      TextAlign.Center,
      TextAnchor.Bottom,
    );
  }

  queueMousePath() {
    const {
      context: uiManager,
      lineRenderer: lR,
      textRenderer: tR,
      circleRenderer: cR,
    } = this.renderer;
    const mouseDownPlanet = uiManager.getMouseDownPlanet();
    const loc = mouseDownPlanet
      ? uiManager.getLocationOfPlanet(mouseDownPlanet.locationId)
      : undefined;

    const to: WorldCoords | undefined = uiManager.getHoveringOverCoords();
    const from: WorldCoords | undefined = loc?.coords;
    const toPlanet = uiManager.getPlanetWithCoords(to);

    if (mouseDownPlanet && from && to) {
      if (uiManager.getIsChoosingTargetPlanet()) {
        const artifactType = uiManager.getLinkSourceArtifactType();

        let showText = `Wormhole Target`;
        let lineColor = purpleA;

        if (artifactType === ArtifactType.IceLink) {
          showText = "IceLink Target";
          lineColor = blueA;
        } else if (artifactType === ArtifactType.FireLink) {
          showText = "FireLink Target";
          lineColor = pinkA;
        } else if (artifactType === ArtifactType.BlackDomain) {
          showText = "BlackDomain Target";
          lineColor = sensaichaA;
        } else if (artifactType === ArtifactType.Kardashev) {
          showText = "Kardashev Target";
          lineColor = redA;
        } else if (artifactType === ArtifactType.Bomb) {
          showText = "Bomb Target";
          lineColor = pinkA;
          const fromPlanet = uiManager.getPlanetWithCoords(from);
          if (fromPlanet) {
            const range = getRange(fromPlanet, 100);
            cR.queueCircleWorld(from, range / 2, pinkA, 2);
          }
          if (toPlanet) {
            const rarity = uiManager.getLinkSourceArtifactRarity();
            cR.queueCircleWorld(to, Number(rarity) * 500, [255, 192, 203, 100]);
          }
        }

        lR.queueLineWorld(from, to, lineColor, 2, RenderZIndex.Voyages);
        tR.queueTextWorld(showText, { x: to.x, y: to.y }, lineColor);
      } else {
        const myPlanet = uiManager.getPlanetWithCoords(from);
        if (myPlanet && isLocatable(myPlanet) && to !== from) {
          whiteA[3] = 255;
          lR.queueLineWorld(
            from,
            to,
            uiManager.isAbandoning() ? orangeA : whiteA,
            2,
            RenderZIndex.Voyages,
            true,
          );

          let effectiveEnergy = myPlanet.energy;

          for (const unconfirmedMove of myPlanet.transactions?.getTransactions(
            isUnconfirmedMoveTx,
          ) ?? []) {
            effectiveEnergy -= unconfirmedMove.intent.forces;
          }

          const energy =
            (uiManager.getForcesSending(myPlanet.locationId) / 100) *
            effectiveEnergy;
          const distance = uiManager.getDistCoords(from, to);

          const myAtk: number = uiManager.getEnergyArrivingForMove(
            myPlanet.locationId,
            toPlanet?.locationId,
            distance,
            energy,
          );

          if (
            !uiManager.getHoveringOverPlanet() &&
            !uiManager.isSendingShip(myPlanet.locationId)
          ) {
            const color = myAtk > 0 ? whiteA : redA;
            color[3] = 255;
            tR.queueTextWorld(
              `Energy: ${Math.round(myAtk)}`,
              { x: to.x, y: to.y },
              color,
            );
          }
        }
      }
    }

    const preview = uiManager.getAttackPreview();
    if (preview) {
      whiteA[3] = 255;
      lR.queueLineWorld(
        preview.from,
        preview.to,
        whiteA,
        2,
        RenderZIndex.Voyages,
        true,
      );
    }
  }

  private queueRectAtPlanet(
    planet: Planet,
    coords: WorldCoords,
    color: RGBVec,
  ) {
    const { context: uiManager, rectRenderer } = this.renderer;
    const sideLength =
      2.3 * uiManager.getRadiusOfPlanetLevel(planet.planetLevel);

    rectRenderer.queueRectCenterWorld(coords, sideLength, sideLength, color, 2);
  }

  queueSelectedRect() {
    const { context: uiManager } = this.renderer;
    const selectedCoords = uiManager.getSelectedCoords();
    const selectedPlanet = uiManager.getSelectedPlanet();
    if (!selectedPlanet || !selectedCoords) {
      return;
    }

    redA[3] = 255;
    this.queueRectAtPlanet(selectedPlanet, selectedCoords, red);
  }

  queueHoveringRect() {
    const { context: uiManager, rectRenderer } = this.renderer;

    const hoverCoords = uiManager.getHoveringOverCoords();
    const hoverPlanet = uiManager.getHoveringOverPlanet();
    if (!hoverCoords) {
      return;
    }
    if (!hoverPlanet) {
      rectRenderer.queueRectCenterWorld(hoverCoords, 1, 1, white, 2);
    } else {
      this.queueRectAtPlanet(hoverPlanet, hoverCoords, white);
    }
  }

  drawMiner() {
    const { overlay2dRenderer } = this.renderer;
    overlay2dRenderer.drawMiner();
  }

  queueSelectedRangeRing() {
    const selectedPlanet = this.renderer.context.getSelectedPlanet();
    const hoverPlanet = this.renderer.context.getHoveringOverPlanet();
    selectedPlanet &&
      (!hoverPlanet || hoverPlanet?.locationId === selectedPlanet.locationId) &&
      this.renderer.planetRenderManager.queueRangeRings(selectedPlanet);
  }

  flush(): void {}
}
