import {
  getInnerCircleShrinkPercent,
  getRange,
  isLocatable,
} from "@df/gamelogic";
import { isUnconfirmedMoveTx } from "@df/serde";
import type {
  CanvasCoords,
  Planet,
  RGBAVec,
  UIRendererType,
  WorldCoords,
} from "@df/types";
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

const { orangeA, redA, white, purpleA, blueA, pinkA, sensaichaA } =
  engineConsts.colors;
const ORIGIN = { x: 0, y: 0 };
const SELECTION_COLOR: RGBAVec = [110, 236, 223, 245];
const HOVER_COLOR: RGBAVec = [192, 218, 244, 215];

export function getInnerCircleLabelPosition(
  center: CanvasCoords,
  radius: number,
  width: number,
  height: number,
): CanvasCoords | undefined {
  const left = 42;
  const right = width - left;
  const top = 24;
  const bottom = height - top;
  if (right <= left || bottom <= top || radius <= 0) return;

  const anchor = { x: width / 2, y: height * 0.4 };
  let position: CanvasCoords | undefined;
  let closest = Infinity;
  const consider = (x: number, y: number) => {
    if (x < left || x > right || y < top || y > bottom) return;
    const distance = (x - anchor.x) ** 2 + (y - anchor.y) ** 2;
    if (distance < closest) {
      closest = distance;
      position = { x, y };
    }
  };

  const dx = anchor.x - center.x;
  const dy = anchor.y - center.y;
  const length = Math.hypot(dx, dy);
  if (length > 0) {
    consider(
      center.x + (dx / length) * radius,
      center.y + (dy / length) * radius,
    );
  } else {
    consider(center.x, center.y - radius);
  }

  // If the closest point is clipped, the visible arc starts or ends at an inset edge.
  for (const x of [left, right]) {
    const offset = radius ** 2 - (x - center.x) ** 2;
    if (offset < 0) continue;
    const dy = Math.sqrt(offset);
    consider(x, center.y - dy);
    consider(x, center.y + dy);
  }
  for (const y of [top, bottom]) {
    const offset = radius ** 2 - (y - center.y) ** 2;
    if (offset < 0) continue;
    const dx = Math.sqrt(offset);
    consider(center.x - dx, y);
    consider(center.x + dx, y);
  }
  return position;
}

export class UIRenderer implements UIRendererType {
  renderer: Renderer;

  rendererType = RendererType.UI;

  constructor(gl: GameGLManager) {
    this.renderer = gl.renderer;
  }

  queueBorders() {
    const { circleRenderer, context } = this.renderer;
    const viewport = this.renderer.getViewport();
    const { viewportWidth, viewportHeight } = viewport;
    const center = viewport.worldToCanvasCoords(ORIGIN);
    const nearX = Math.max(-center.x, 0, center.x - viewportWidth);
    const nearY = Math.max(-center.y, 0, center.y - viewportHeight);
    const near = Math.hypot(nearX, nearY);
    const far = Math.hypot(
      Math.max(Math.abs(center.x), Math.abs(center.x - viewportWidth)),
      Math.max(Math.abs(center.y), Math.abs(center.y - viewportHeight)),
    );

    const inner = context.getInnerRadius();
    if (Number.isFinite(inner) && inner > 0) {
      const edge = viewport.worldToCanvasDist(inner);
      if (edge > near) {
        circleRenderer.queueCircleWorld(ORIGIN, inner, [112, 54, 38, 32]);
      }
      if (edge >= near - 10 && edge <= far + 10) {
        circleRenderer.queueCircleWorld(ORIGIN, inner, [255, 121, 87, 42], 8);
        circleRenderer.queueCircleWorld(ORIGIN, inner, [224, 122, 87, 126], 1);
        circleRenderer.queueCircleWorld(
          ORIGIN,
          inner,
          [255, 187, 147, 240],
          2,
          1,
          true,
        );
        const label = getInnerCircleLabelPosition(
          center,
          edge,
          viewportWidth,
          viewportHeight,
        );
        if (label) this.drawInnerCircleProgress(label, inner);
      }
    }

    const outer = context.getWorldRadius();
    const edge = viewport.worldToCanvasDist(outer);
    if (
      Number.isFinite(outer) &&
      outer > 0 &&
      edge >= near - 10 &&
      edge <= far + 10
    ) {
      circleRenderer.queueCircleWorld(ORIGIN, outer, [89, 164, 242, 44], 7);
      circleRenderer.queueCircleWorld(ORIGIN, outer, [144, 203, 255, 225], 2);
    }
  }

  private drawInnerCircleProgress({ x, y }: CanvasCoords, innerRadius: number) {
    const { ctx } = this.renderer.overlay2dRenderer;
    const label = `${getInnerCircleShrinkPercent(innerRadius).toFixed(1)}%`;
    ctx.save();
    ctx.font = "600 13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const width = Math.ceil(ctx.measureText(label).width) + 20;
    ctx.beginPath();
    ctx.roundRect(x - width / 2, y - 12, width, 24, 6);
    ctx.fillStyle = "#1d1722";
    ctx.fill();
    ctx.strokeStyle = "#be7c61";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#ffd4b9";
    ctx.fillText(label, x, y);
    ctx.restore();
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
          this.queueLaunchVector(
            from,
            to,
            uiManager.isAbandoning() ? orangeA : SELECTION_COLOR,
            toPlanet,
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
            const color = myAtk > 0 ? SELECTION_COLOR : redA;
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
    if (
      preview &&
      !(
        from &&
        to &&
        from.x === preview.from.x &&
        from.y === preview.from.y &&
        to.x === preview.to.x &&
        to.y === preview.to.y
      )
    ) {
      this.queueLaunchVector(
        preview.from,
        preview.to,
        SELECTION_COLOR,
        uiManager.getPlanetWithCoords(preview.to),
      );
    }
  }

  private queueLaunchVector(
    from: WorldCoords,
    to: WorldCoords,
    color: RGBAVec,
    destination?: Planet,
  ) {
    const { context, lineRenderer } = this.renderer;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy);
    if (distance === 0) return;

    const scale = this.renderer.getViewport().scale;
    const ux = dx / distance;
    const uy = dy / distance;
    const inset = destination
      ? Math.min(
          distance * 0.42,
          context.getRadiusOfPlanetLevel(destination.planetLevel) * 1.2 +
            scale * 4,
        )
      : 0;
    const tip = { x: to.x - ux * inset, y: to.y - uy * inset };
    const tail = Math.min(scale * 10, (distance - inset) * 0.28);
    const base = { x: tip.x - ux * tail, y: tip.y - uy * tail };
    const wing = tail * 0.52;
    const z = RenderZIndex.Voyages;
    lineRenderer.queueLineWorld(
      from,
      tip,
      [color[0], color[1], color[2], 48],
      5,
      z,
    );
    lineRenderer.queueLineWorld(from, tip, color, 1, z, true);
    lineRenderer.queueLineWorld(
      { x: base.x - uy * wing, y: base.y + ux * wing },
      tip,
      color,
      1,
      z,
    );
    lineRenderer.queueLineWorld(
      { x: base.x + uy * wing, y: base.y - ux * wing },
      tip,
      color,
      1,
      z,
    );
  }

  private queuePlanetBrackets(
    planet: Planet,
    coords: WorldCoords,
    color: RGBAVec,
  ) {
    const { context, lineRenderer } = this.renderer;
    const scale = this.renderer.getViewport().scale;
    const radius = Math.max(
      1.2 * context.getRadiusOfPlanetLevel(planet.planetLevel),
      scale * 8,
    );
    const shoulder = Math.min(radius * 0.38, scale * 15);
    for (const horizontal of [-1, 1]) {
      for (const vertical of [-1, 1]) {
        const corner = {
          x: coords.x + horizontal * radius,
          y: coords.y + vertical * radius,
        };
        lineRenderer.queueLineWorld(
          corner,
          { x: corner.x - horizontal * shoulder, y: corner.y },
          color,
          1,
        );
        lineRenderer.queueLineWorld(
          corner,
          { x: corner.x, y: corner.y - vertical * shoulder },
          color,
          1,
        );
      }
    }
  }

  queueSelectedRect() {
    const { context: uiManager } = this.renderer;
    const selectedCoords = uiManager.getSelectedCoords();
    const selectedPlanet = uiManager.getSelectedPlanet();
    if (!selectedPlanet || !selectedCoords) {
      return;
    }

    this.queuePlanetBrackets(selectedPlanet, selectedCoords, SELECTION_COLOR);
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
    } else if (
      hoverPlanet.locationId !== uiManager.getSelectedPlanet()?.locationId
    ) {
      this.queuePlanetBrackets(hoverPlanet, hoverCoords, HOVER_COLOR);
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
