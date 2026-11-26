import type { Renderer } from "../Renderer";
import { WebGLManager } from "./WebGLManager";

export class GameGLManager extends WebGLManager {
  renderer: Renderer;
  declare gl: WebGL2RenderingContext; //TODO handle declare

  constructor(engine: Renderer, glCanvas: HTMLCanvasElement) {
    super(glCanvas, { stencil: true });
    const { gl } = this;

    this.renderer = engine;

    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(
      gl.SRC_ALPHA,
      gl.ONE_MINUS_SRC_ALPHA,
      gl.ONE,
      gl.ONE_MINUS_SRC_ALPHA,
    );
  }

  public clear() {
    const { gl } = this;
    super.clear(
      gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT,
    );
  }
}
