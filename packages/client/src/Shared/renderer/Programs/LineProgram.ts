import { AttribType, UniformType } from "@df/types";

import { glsl } from "../EngineUtils";

const a = {
  position: "a_position",
  color: "a_color",
  dist: "a_dist", // repeats along the line and fraction of a repeat filled
};
const u = {
  matrix: "u_matrix", // matrix to convert from world coords to clipspace
};
const v = {
  color: "v_color",
  dist: "v_dist",
};

export const LINE_PROGRAM_DEFINITION = {
  uniforms: {
    matrix: { name: u.matrix, type: UniformType.Mat4 },
  },
  attribs: {
    position: {
      dim: 3,
      type: AttribType.Float,
      normalize: false,
      name: a.position,
    },
    color: {
      dim: 4,
      type: AttribType.UByte,
      normalize: true,
      name: a.color,
    },
    dist: {
      dim: 2,
      type: AttribType.Float,
      normalize: false,
      name: a.dist,
    },
  },
  vertexShader: glsl`
    in vec4 ${a.position};
    in vec4 ${a.color};
    in vec2 ${a.dist};

    uniform mat4 ${u.matrix};

    out vec4 ${v.color};
    out vec2 ${v.dist};

    void main() {
      gl_Position = ${u.matrix} * ${a.position};

      ${v.color} = ${a.color};
      ${v.dist} = ${a.dist};
    }
  `,
  fragmentShader: glsl`
    precision highp float;
    out vec4 outColor;

    in vec4 ${v.color};
    in vec2 ${v.dist};

    void main() {
      bool isGap = fract(${v.dist}.x) > ${v.dist}.y;
      outColor = isGap ? vec4(0.0, 0.0, 0.0, 0.0) : ${v.color};
    }
  `,
};
