import {
  type CanvasCoords,
  DrawMode,
  type LineDashPattern,
  type LineRendererType,
  RendererType,
  RenderZIndex,
  type RGBAVec,
  type WorldCoords,
} from "@df/types";

import { engineConsts } from "../EngineConsts";
import { LINE_PROGRAM_DEFINITION } from "../Programs/LineProgram";
import type { GameGLManager } from "../WebGL/GameGLManager";
import { GenericRenderer } from "../WebGL/GenericRenderer";

const defaultDash = {
  length: engineConsts.dashLength,
  gap: engineConsts.dashLength,
};

export class LineRenderer
  extends GenericRenderer<typeof LINE_PROGRAM_DEFINITION, GameGLManager>
  implements LineRendererType
{
  rendererType = RendererType.Line;

  constructor(glManager: GameGLManager) {
    super(glManager, LINE_PROGRAM_DEFINITION);
  }

  private getOffset(start: CanvasCoords, end: CanvasCoords): CanvasCoords {
    // calculates normalized perp vector
    const delX = end.x - start.x;
    const delY = end.y - start.y;

    const vX = delY;
    const vY = -delX;

    const norm = Math.sqrt(vX ** 2 + vY ** 2);
    return { x: vX / norm, y: vY / norm };
  }

  public queueLine(
    start: CanvasCoords,
    end: CanvasCoords,
    color: RGBAVec = [255, 0, 0, 255],
    width = 1,
    zIdx: number = RenderZIndex.DEFAULT,
    dashed: boolean | LineDashPattern = false,
  ): void {
    const { position: posA, color: colorA, dist: distA } = this.attribManagers;

    const { x: x1, y: y1 } = start;
    const { x: x2, y: y2 } = end;
    if (x1 === x2 && y1 === y2) return;

    const pattern = dashed === true ? defaultDash : dashed;
    const period = pattern ? pattern.length + pattern.gap : 1;
    const repeats = pattern ? Math.hypot(x2 - x1, y2 - y1) / period : 0;
    const fill = pattern ? pattern.length / period : 1;

    const { x: dX, y: dY } = this.getOffset(start, end);

    // Calculate half-width for centered line
    const halfWidth = width / 2;
    // note that width actually scales 2x - it goes 1, 3, 5, etc
    for (let i = -halfWidth; i <= halfWidth; i++) {
      posA.setVertex(
        // prettier-ignore
        [
          x1 + dX * i, y1 + dY * i, zIdx,
          x2 + dX * i, y2 + dY * i, zIdx,
        ],
        this.verts,
      );

      colorA.setVertex(color, this.verts);
      colorA.setVertex(color, this.verts + 1);
      distA.setVertex([0, fill, repeats, fill], this.verts);
      this.verts += 2;
    }
  }

  public queueLineWorld(
    start: WorldCoords,
    end: WorldCoords,
    color: RGBAVec = [255, 0, 0, 255],
    width = 1,
    zIdx: number = RenderZIndex.DEFAULT,
    dashed: boolean | LineDashPattern = false,
  ) {
    const viewport = this.manager.renderer.getViewport();
    const startC = viewport.worldToCanvasCoords(start);
    const endC = viewport.worldToCanvasCoords(end);
    this.queueLine(startC, endC, color, width, zIdx, dashed);
  }

  public setUniforms(): void {
    this.uniformSetters.matrix(this.manager.projectionMatrix);
  }

  public flush(): void {
    super.flush(DrawMode.Lines);
  }
}
