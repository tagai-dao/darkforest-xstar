import {
  type AttribProps,
  DrawMode,
  type UniformProps,
  UniformType,
  type Vec3,
} from "@df/types";
import type { mat3, mat4 } from "gl-matrix";

import { AttribManager } from "./AttribManager";
import { ProgramUtils } from "./ProgramUtils";
import type { WebGLManager } from "./WebGLManager";

export type UniformData = {
  [key: string]: UniformProps;
};

export type AttribData = {
  [key: string]: AttribProps;
};

/**
 * An object that describes all of the necessary data to create and manage
 * this program within the renderer.
 */
export interface EngineProgramDefinition {
  uniforms: UniformData;
  attribs: AttribData;
  vertexShader: string;
  fragmentShader: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type UniformSetter = (el: any) => void;

export type UniformSetters<T extends EngineProgramDefinition> = {
  [k in keyof T["uniforms"]]: UniformSetter;
};

export type UniformLocs<T extends EngineProgramDefinition> = {
  [k in keyof T["uniforms"]]: WebGLUniformLocation;
};

export type AttribManagers<T extends EngineProgramDefinition> = {
  [k in keyof T["attribs"]]: AttribManager;
};

/**
 * Create a setter which writes the given uniform specified by `props` to `loc`.
 * Note that this function does not call gl.useProgram().
 *
 * @param gl The WebGL rendering context this uniform is in.
 * @param loc The uniform location to write to.
 * @param props UniformProps for this uniform.
 */
export function getUniformSetter(
  gl: WebGL2RenderingContext,
  loc: WebGLUniformLocation,
  props: UniformProps,
): UniformSetter {
  const { name, type } = props;
  if (type === UniformType.Mat4) {
    return (el: mat4) => {
      gl.uniformMatrix4fv(loc, false, el);
    };
  } else if (type === UniformType.Mat3) {
    return (el: mat3) => {
      gl.uniformMatrix3fv(loc, false, el);
    };
  } else if (type === UniformType.Float) {
    return (el: number) => {
      gl.uniform1f(loc, el);
    };
  } else if (type === UniformType.UByte) {
    return (el: number) => {
      gl.uniform1i(loc, el);
    };
  } else if (type === UniformType.Texture) {
    return (el: number) => {
      gl.uniform1i(loc, el);
    };
  } else if (type === UniformType.Vec3) {
    return (el: Vec3) => {
      gl.uniform3fv(loc, el);
    };
  } else {
    throw `uniform type for ${name} not recognized`;
  }
}

/**
 * Takes in a gl context, program sources (frag and vert shader),
 * and data about attribs / uniforms and provides:
 * - attrib managers
 * - uniform setters
 * - skeleton code for rendering in our engine via `flush()`
 */
export class GenericRenderer<
  T extends EngineProgramDefinition,
  U extends WebGLManager = WebGLManager,
> {
  /** The program corresponding to this renderer. */
  public program: WebGLProgram;

  /** A dictionary of uniform setters, keyed by uniform name. */
  public uniformSetters: UniformSetters<T>;

  /** A dictionary of attrib managers, keyed by attrib name. */
  public attribManagers: AttribManagers<T>;

  /**
   * Uniform data for this program. Typically not used after construction.
   * Kept for use in inherited classes.
   */
  public uniformData: UniformData;
  /**
   * Uniform data for this program. Typically not used after construction.
   * Kept for use in inherited classes.
   */
  public attribData: AttribData;

  /**
   * Uniform locs for this program. Typically not referenced directly,
   * but rather through generated uniformSetters. Kept for use in inherited classes.
   */
  public uniformLocs: UniformLocs<T>;

  /** GameGLManager corresponding to this program. */
  public manager: U;

  /** The number of queued vertices so far. Used for batch rendering. */
  public verts: number; // TODO make private and use setter

  /**
   * Create a renderer from a GameGLManager and program data.
   * @param glManager GameGLManager which holds context for rendering this program.
   * @param programData ProgramData describing this program.
   */
  constructor(glManager: U, programData: T) {
    this.verts = 0;

    this.manager = glManager;
    const { gl } = glManager;

    const {
      vertexShader: vert,
      fragmentShader: frag,
      uniforms,
      attribs,
    } = programData;

    const program = ProgramUtils.programFromSources(gl, vert, frag);
    if (program === null) {
      throw "error compiling program";
    }
    this.program = program;

    this.uniformData = uniforms;
    this.attribData = attribs;

    gl.useProgram(program); // may be superfluous

    // construct uniform setters
    const uniformLocs: Partial<UniformLocs<T>> = {};
    const uniformSetters: Partial<UniformSetters<T>> = {};
    for (const [key, props] of Object.entries(uniforms)) {
      const { name } = props;
      const k = key as keyof T["uniforms"];
      const loc = gl.getUniformLocation(program, name);
      if (!loc) {
        throw `uniform ${name} doesn't exist!`;
      }

      uniformLocs[k] = loc;
      uniformSetters[k] = getUniformSetter(gl, loc, props);
    }
    this.uniformLocs = uniformLocs as UniformLocs<T>;
    this.uniformSetters = uniformSetters as UniformSetters<T>;

    // construct attrib managers
    const attribManagers: Partial<AttribManagers<T>> = {};
    for (const [key, props] of Object.entries(attribs)) {
      const k = key as keyof T["attribs"];
      attribManagers[k] = new AttribManager(gl, program, props);
    }
    this.attribManagers = attribManagers as AttribManagers<T>;
  }

  /**
   * Run by flush(). Override this in child classes. Programs with uniformss
   * should always override this.
   */
  public setUniforms() {
    if (Object.keys(this.uniformData).length !== 0) {
      console.error("did not override setUniforms!");
    }
    return;
  }

  /**
   * Draw all buffered vertices to the screen.
   * @param drawMode The drawing mode for the buffered vertices. Default: Triangles.
   */
  public flush(drawMode: DrawMode = DrawMode.Triangles) {
    const { gl } = this.manager;

    // 无顶点时仍清理 attribute：上一帧其它 program 可能留下了 enable 但未绑定的槽位，
    // 若本帧所有 renderer 都 early-return，会导致后续 drawArrays INVALID_OPERATION。
    if (this.verts === 0) {
      gl.useProgram(this.program);
      const maxAttribs = gl.getParameter(gl.MAX_VERTEX_ATTRIBS) as number;
      for (let i = 0; i < maxAttribs; i++) {
        gl.disableVertexAttribArray(i);
      }
      return;
    }

    gl.useProgram(this.program);

    this.setUniforms();

    // 多个 GenericRenderer 共用同一 gl 时，各程序在构造阶段 enable 的 attribute 会一直保持启用；
    // 切换 useProgram 后若仍有「已启用但未绑定当前 VBO」的槽位，drawArrays 会报 INVALID_OPERATION。
    const maxAttribs = gl.getParameter(gl.MAX_VERTEX_ATTRIBS) as number;
    for (let i = 0; i < maxAttribs; i++) {
      gl.disableVertexAttribArray(i);
    }

    for (const attrib in this.attribManagers) {
      this.attribManagers[attrib].bufferData(this.verts);
    }

    // draw
    gl.drawArrays(drawMode, 0, this.verts);

    this.verts = 0;
  }
}
