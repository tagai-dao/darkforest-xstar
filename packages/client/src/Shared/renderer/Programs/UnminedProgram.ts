import { AttribType, UniformType } from "@df/types";

import { glsl } from "../EngineUtils";
import { ShaderMixins } from "../WebGL/ShaderMixins";

const a = {
  position: "a_position",
  color: "a_color",
  rectPos: "a_rectPos",
};
const u = {
  matrix: "u_matrix", // matrix to convert from world coords to clipspace
  viewportCenter: "u_viewportCenter",
  time: "u_time",
};
const v = {
  color: "v_color",
  rectPos: "v_rectPos",
};

export const UNMINED_PROGRAM_DEFINITION = {
  uniforms: {
    matrix: { name: u.matrix, type: UniformType.Mat4 },
    viewportCenter: { name: u.viewportCenter, type: UniformType.Vec3 },
    time: { name: u.time, type: UniformType.Float },
  },
  attribs: {
    position: {
      dim: 3,
      type: AttribType.Float,
      normalize: false,
      name: a.position,
    },
    color: {
      dim: 3,
      type: AttribType.UByte,
      normalize: true,
      name: a.color,
    },
    rectPos: {
      dim: 2,
      type: AttribType.Float,
      normalize: false,
      name: a.rectPos,
    },
  },
  vertexShader: glsl`
    in vec4 ${a.position};
    in vec4 ${a.color};
    in vec2 ${a.rectPos};

    uniform mat4 ${u.matrix};
    uniform vec3 ${u.viewportCenter};
    uniform float ${u.time};

    out vec4 ${v.color};
    out vec2 ${v.rectPos};

    void main() {
      gl_Position = ${u.matrix} * ${a.position};

      ${v.color} = ${a.color};
      ${v.rectPos} = ${a.rectPos};
    }
  `,
  fragmentShader: glsl`
    precision highp float;
    out vec4 outColor;

    ${ShaderMixins.perlin3}

    in vec4 ${v.color};
    in vec2 ${v.rectPos};
    
    uniform vec3 ${u.viewportCenter};
    uniform float ${u.time};

    void main() {
      vec2 pos = ${v.rectPos} + ${u.viewportCenter}.xy * .00016;
      float dust = cnoise(vec3(pos * 3.4, ${u.time} * .008));
      vec3 fog = mix(vec3(.012, .018, .037), vec3(.025, .04, .075),
        smoothstep(-.4, .6, dust));
      outColor = vec4(fog + ${v.color}.rgb * .1, .44);
    }
  `,
};
