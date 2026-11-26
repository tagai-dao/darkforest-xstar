import { expect, it, vi } from "vitest";

import type { GameGLManager } from "../WebGL/GameGLManager";
import { ProgramUtils } from "../WebGL/ProgramUtils";
import { WebGLManager } from "../WebGL/WebGLManager";
import { TextRenderer } from "./TextRenderer";

it("uploads and rebinds the text atlas when a WebGL context is reused", () => {
  const unpackFlipY = 37440;
  const unpackPremultiplyAlpha = 37441;
  const unpack = new Map([
    [unpackFlipY, true],
    [unpackPremultiplyAlpha, true],
  ]);
  const stateDuringUpload = vi.fn();
  const gl = {
    TEXTURE0: 33984,
    TEXTURE_2D: 3553,
    UNPACK_FLIP_Y_WEBGL: unpackFlipY,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: unpackPremultiplyAlpha,
    getParameter: (param: number) => unpack.get(param),
    pixelStorei: (param: number, value: boolean) => unpack.set(param, value),
    texImage2D: () =>
      stateDuringUpload(
        unpack.get(unpackFlipY),
        unpack.get(unpackPremultiplyAlpha),
      ),
    createTexture: vi.fn(() => ({})),
    generateMipmap: vi.fn(),
    activeTexture: vi.fn(),
    bindTexture: vi.fn(),
    getUniformLocation: vi.fn(() => ({})),
    uniformMatrix4fv: vi.fn(),
    uniform1i: vi.fn(),
    useProgram: vi.fn(),
    getAttribLocation: () => -1,
  };
  const bufferCanvas = {
    getContext: () => ({
      canvas: bufferCanvas,
      clearRect: vi.fn(),
      fillText: vi.fn(),
    }),
  };
  const canvas = { width: 640, height: 480, getContext: () => gl };
  const setupRenderer = () => {
    const manager = new WebGLManager(canvas as unknown as HTMLCanvasElement);
    return new TextRenderer(
      Object.assign(manager, {
        renderer: { bufferCanvas },
      }) as unknown as GameGLManager,
    );
  };
  const program = vi
    .spyOn(ProgramUtils, "programFromSources")
    .mockReturnValue({});

  try {
    setupRenderer();
    const rebuiltRenderer = setupRenderer();
    expect(stateDuringUpload.mock.calls).toEqual([
      [false, false],
      [false, false],
    ]);
    expect([...unpack.values()]).toEqual([true, true]);

    gl.bindTexture(gl.TEXTURE_2D, { otherTexture: true });
    rebuiltRenderer.setUniforms();
    expect(gl.bindTexture).toHaveBeenLastCalledWith(
      gl.TEXTURE_2D,
      gl.createTexture.mock.results[1].value,
    );
    expect(gl.uniform1i).toHaveBeenCalledWith(expect.anything(), 0);
  } finally {
    program.mockRestore();
  }
});
