import type { AttribProps } from "@df/types";

import { AttribArray } from "./AttribArray";

/**
 * Responsible for queuing data about a webgl attribute and then writing to it.
 * Does this by maintaining a persistent AttribArray and WebGLBuffer reference,
 * and then calling bufferData on n vertices at a time. Allows us to upload
 * whole arrays of objects at once, providing speed boost.
 */
export class AttribManager {
  /**
   * The WebGL rendering context.
   */
  private gl: WebGL2RenderingContext;

  /**
   * AttribProps object for this attribute, containing name, dimension, and more.
   */
  private props: AttribProps;

  /**
   * Attrib loc, returned by gl.getAttribLocation().
   */
  private loc: number;

  /**
   * The WebGLBuffer associated with this attribute（着色器可能优化掉 attribute，此时为 null）。
   */
  private buffer: WebGLBuffer | null;

  /**
   * An internally managed AttribArray, which is a typed mutable array.
   */
  private attribArray: AttribArray;

  /**
   * For a given attribute on a program on a context, create an AttribManager.
   * @param gl - The WebGL context to generate this attrib on.
   * @param program - The program corresponding to this attrib.
   * @param props - An AttribProps object, containing the attrib name and other info.
   * @param _enable 保留参数以兼容旧调用；enable 已移至 bufferData，避免跨程序污染 attribute 状态。
   */
  constructor(
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
    props: AttribProps,
    _enable = true,
  ) {
    this.gl = gl;
    this.props = props;

    gl.useProgram(program); // should not be necessary, but just in case

    const loc = gl.getAttribLocation(program, props.name);
    // 被链接器优化掉的 attribute 不要建 buffer，也不要 enable（避免 WebGL 无效状态污染全局）。
    if (loc < 0) {
      this.loc = loc;
      this.buffer = null;
      this.attribArray = new AttribArray(props.type);
      return;
    }

    const buffer = gl.createBuffer();
    if (!buffer) {
      throw "Error creating buffer for attrib: " + props.name;
    }

    this.loc = loc;
    this.buffer = buffer;

    this.attribArray = new AttribArray(props.type);
  }

  /**
   * Set vertices starting from vertex #idx - writing to vertex #0 will write to the first vertex.
   *
   * Note that you can write multiple vertices at once - if you write a 6-long array into a 2D
   * attribute at vertex 0, you will write 3 vertices at once.
   *
   * @param els - The data to write into the vertices.
   * @param idx - The starting vertex # to write to.
   */
  public setVertex(els: number[], idx: number): void {
    if (this.loc < 0) return;
    this.attribArray.set(els, idx * this.props.dim);
  }

  /**
   * Send vertices [0, n - 1] through the buffer - bufferData(1) will send one vertex (only vertex #0)
   * @param n The number of vertices to send through the buffer.
   */
  public bufferData(n: number): void {
    if (this.loc < 0 || !this.buffer) return;

    const { gl, loc } = this;
    const { dim, type, normalize } = this.props;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.vertexAttribPointer(loc, dim, type, normalize, 0, 0);
    gl.enableVertexAttribArray(loc);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      this.attribArray.array,
      gl.DYNAMIC_DRAW,
      0,
      n * dim,
    );
  }
}
