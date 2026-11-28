import { MAX_PERLIN_VALUE } from "@df/hashing";
import { AttribType, UniformType } from "@df/types";

import { glsl } from "../EngineUtils";
import { ShaderMixins } from "../WebGL/ShaderMixins";

const a = {
  position: "a_position",

  p0topGrad: "a_p0topGrad",
  p0botGrad: "a_p0botGrad",

  p1topGrad: "a_p1topGrad",
  p1botGrad: "a_p1botGrad",

  p2topGrad: "a_p2topGrad",
  p2botGrad: "a_p2botGrad",

  worldCoords: "a_worldCoords", // 0 to 1
};
const u = {
  matrix: "u_matrix", // matrix to convert from world coords to clipspace
  thresholds: "u_thresholds",
  lengthScale: "u_lengthScale",
  viewportZoom: "u_viewportZoom",
  time: "u_time",

  innerNebulaColor: "u_innerNebulaColor",
  nebulaColor: "u_nebulaColor",
  spaceColor: "u_spaceColor",
  deepSpaceColor: "u_deepSpaceColor",
  deadSpaceColor: "u_deadSpaceColor",
};
const v = {
  p0topLeftGrad: "v_p0topLeftGrad",
  p0topRightGrad: "v_p0topRightGrad",
  p0botLeftGrad: "v_p0botLeftGrad",
  p0botRightGrad: "v_p0botRightGrad",

  p1topLeftGrad: "v_p1topLeftGrad",
  p1topRightGrad: "v_p1topRightGrad",
  p1botLeftGrad: "v_p1botLeftGrad",
  p1botRightGrad: "v_p1botRightGrad",

  p2topLeftGrad: "v_p2topLeftGrad",
  p2topRightGrad: "v_p2topRightGrad",
  p2botLeftGrad: "v_p2botLeftGrad",
  p2botRightGrad: "v_p2botRightGrad",

  worldCoords: "v_worldCoords", // 0 to 1
  position: "v_position",
};

const gradProps = {
  dim: 4,
  type: AttribType.Float,
  normalize: false,
};

export const SPACE_PROGRAM_DEFINITION = {
  uniforms: {
    matrix: { name: u.matrix, type: UniformType.Mat4 },
    thresholds: { name: u.thresholds, type: UniformType.Vec3 },
    lengthScale: { name: u.lengthScale, type: UniformType.Float },
    viewportZoom: { name: u.viewportZoom, type: UniformType.Float },
    time: { name: u.time, type: UniformType.Float },
    innerNebulaColor: { name: u.innerNebulaColor, type: UniformType.Vec3 },
    nebulaColor: { name: u.nebulaColor, type: UniformType.Vec3 },
    spaceColor: { name: u.spaceColor, type: UniformType.Vec3 },
    deepSpaceColor: { name: u.deepSpaceColor, type: UniformType.Vec3 },
    deadSpaceColor: { name: u.deadSpaceColor, type: UniformType.Vec3 },
  },
  attribs: {
    position: {
      dim: 2,
      type: AttribType.Float,
      normalize: false,
      name: a.position,
    },
    worldCoords: {
      dim: 2,
      type: AttribType.Float,
      normalize: false,
      name: a.worldCoords,
    },

    p0topGrad: {
      ...gradProps,
      name: a.p0topGrad,
    },
    p0botGrad: {
      ...gradProps,
      name: a.p0botGrad,
    },

    p1topGrad: {
      ...gradProps,
      name: a.p1topGrad,
    },
    p1botGrad: {
      ...gradProps,
      name: a.p1botGrad,
    },

    p2topGrad: {
      ...gradProps,
      name: a.p2topGrad,
    },
    p2botGrad: {
      ...gradProps,
      name: a.p2botGrad,
    },
  },
  vertexShader: glsl`
    in vec4 ${a.position};

    in vec4 ${a.p0topGrad};
    in vec4 ${a.p0botGrad};
    in vec4 ${a.p1topGrad};
    in vec4 ${a.p1botGrad};
    in vec4 ${a.p2topGrad};
    in vec4 ${a.p2botGrad};

    in vec2 ${a.worldCoords};

    uniform mat4 ${u.matrix};

    out vec2 ${v.p0topLeftGrad};
    out vec2 ${v.p0topRightGrad};
    out vec2 ${v.p0botLeftGrad};
    out vec2 ${v.p0botRightGrad};

    out vec2 ${v.p1topLeftGrad};
    out vec2 ${v.p1topRightGrad};
    out vec2 ${v.p1botLeftGrad};
    out vec2 ${v.p1botRightGrad};

    out vec2 ${v.p2topLeftGrad};
    out vec2 ${v.p2topRightGrad};
    out vec2 ${v.p2botLeftGrad};
    out vec2 ${v.p2botRightGrad};

    out vec2 ${v.worldCoords};
    out vec4 ${v.position};

    void main() {
      gl_Position = ${u.matrix} * ${a.position};

      ${v.worldCoords} = ${a.worldCoords};
      ${v.position} = ${a.position};

      ${v.p0topLeftGrad} = ${a.p0topGrad}.xy;
      ${v.p0topRightGrad} = ${a.p0topGrad}.zw;
      ${v.p0botLeftGrad} = ${a.p0botGrad}.xy;
      ${v.p0botRightGrad} = ${a.p0botGrad}.zw;

      ${v.p1topLeftGrad} = ${a.p1topGrad}.xy;
      ${v.p1topRightGrad} = ${a.p1topGrad}.zw;
      ${v.p1botLeftGrad} = ${a.p1botGrad}.xy;
      ${v.p1botRightGrad} = ${a.p1botGrad}.zw;

      ${v.p2topLeftGrad} = ${a.p2topGrad}.xy;
      ${v.p2topRightGrad} = ${a.p2topGrad}.zw;
      ${v.p2botLeftGrad} = ${a.p2botGrad}.xy;
      ${v.p2botRightGrad} = ${a.p2botGrad}.zw;
    }
  `,
  fragmentShader: glsl`
    precision highp float;
    out vec4 outColor;

    in vec2 ${v.p0topLeftGrad};
    in vec2 ${v.p0topRightGrad};
    in vec2 ${v.p0botLeftGrad};
    in vec2 ${v.p0botRightGrad};

    in vec2 ${v.p1topLeftGrad};
    in vec2 ${v.p1topRightGrad};
    in vec2 ${v.p1botLeftGrad};
    in vec2 ${v.p1botRightGrad};

    in vec2 ${v.p2topLeftGrad};
    in vec2 ${v.p2topRightGrad};
    in vec2 ${v.p2botLeftGrad};
    in vec2 ${v.p2botRightGrad};

    in vec2 ${v.worldCoords};
    in vec4 ${v.position};

    uniform vec3 ${u.thresholds};

    uniform float ${u.lengthScale};
    uniform float ${u.viewportZoom};
    uniform float ${u.time};

    // space type palette
    uniform vec3 ${u.innerNebulaColor};
    uniform vec3 ${u.nebulaColor};
    uniform vec3 ${u.spaceColor};
    uniform vec3 ${u.deepSpaceColor};
    uniform vec3 ${u.deadSpaceColor};

    ${ShaderMixins.perlin3}

    // interpolates map data to produce space type
    float perlin(float scale, float x, float y, vec2 blGrad, vec2 brGrad, vec2 tlGrad, vec2 trGrad) {
      float gridX = floor(x / scale) * scale;
      float gridY = floor(y / scale) * scale;

      float px = (x - gridX) / scale;
      float py = (y - gridY) / scale;

      // 0 to 1 within each chunk
      vec2 pos = vec2(px, py);

      vec2 botLeftDiff = pos - vec2(0., 0.);
      vec2 botRightDiff = pos - vec2(1., 0.);
      vec2 topLeftDiff = pos - vec2(0., 1.);
      vec2 topRightDiff = pos - vec2(1., 1.);

      float botLeft = dot(botLeftDiff, blGrad);
      float botRight = dot(botRightDiff, brGrad);
      float topLeft = dot(topLeftDiff, tlGrad);
      float topRight = dot(topRightDiff, trGrad);

      float botLeftW = pos.x * pos.y;
      float botRightW = (1. - pos.x) * pos.y;
      float topLeftW = pos.x * (1. - pos.y);
      float topRightW = (1. - pos.x) * (1. - pos.y);

      float res = botLeft * topRightW +
                  botRight * topLeftW +
                  topLeft * botRightW +
                  topRight * botLeftW;

      return res;
    }

    vec3 spacePalette(float noise, float spawnBand) {
      vec3 nebula = mix(${u.nebulaColor}, ${u.innerNebulaColor},
        0.32 * (1.0 - smoothstep(7.0, max(7.01, ${u.thresholds}.x), noise)));
      vec3 palette = mix(nebula, ${u.spaceColor},
        smoothstep(${u.thresholds}.x - .34, ${u.thresholds}.x + .34, noise));
      palette = mix(palette, ${u.deepSpaceColor},
        smoothstep(${u.thresholds}.y - .34, ${u.thresholds}.y + .34, noise));
      palette = mix(palette, ${u.deadSpaceColor},
        smoothstep(${u.thresholds}.z - .34, ${u.thresholds}.z + .34, noise));
      return mix(palette, nebula, spawnBand);
    }

    float dustStars(vec2 pos) {
      vec2 cell = floor(pos);
      vec3 seed = fract(sin(vec3(dot(cell, vec2(127.1, 311.7)),
        dot(cell, vec2(269.5, 183.3)), dot(cell, vec2(91.7, 177.2)))) * 43758.5453);
      float radius = length(fract(pos) - (.18 + seed.xy * .64));
      return exp2(-radius * 174.0) * smoothstep(.79, .996, seed.z);
    }

    void main() {
      float scale = ${u.lengthScale};
      vec2 world = ${v.worldCoords};
      float x = world.x;
      float y = world.y;

      float p0 = perlin(scale, x, y, ${v.p0botLeftGrad}, ${v.p0botRightGrad}, ${v.p0topLeftGrad}, ${v.p0topRightGrad});
      float p1 = perlin(scale * 2., x, y, ${v.p1botLeftGrad}, ${v.p1botRightGrad}, ${v.p1topLeftGrad}, ${v.p1topRightGrad});
      float p2 = perlin(scale * 4., x, y, ${v.p2botLeftGrad}, ${v.p2botRightGrad}, ${v.p2topLeftGrad}, ${v.p2topRightGrad});
      float noise = (1. + (2. * p0 + p1 + p2) / 4.) * (${MAX_PERLIN_VALUE}. / 2.);

      float distanceFromCenter = length(world);
      float spawnBand = smoothstep(74400.0, 75600.0, distanceFromCenter) *
        (1.0 - smoothstep(86900.0, 88100.0, distanceFromCenter));
      vec3 sector = spacePalette(noise, spawnBand);
      vec2 cloudCoords = world / 3300.0 + ${v.position}.xy * .0006;

      float drift = mod(${u.time}, 7200.0) * .005;
      float mist = cnoise(vec3(cloudCoords, drift));
      float fibres = cnoise(vec3(cloudCoords * 2.8 + vec2(mist), drift * .55));
      float cloud = smoothstep(-.28, .82, mist + .38 * fibres);
      float variation = 1.0 - 0.22 * smoothstep(25.0, 190.0, ${u.viewportZoom});

      // The transparent map tint lets the dim, screen-space star field show
      // through while explored chunks still carry their sector color.
      vec3 base = vec3(.037, .055, .092);
      vec3 lit = base + sector * (.55 + variation * cloud * .54);
      lit += vec3(.035, .058, .096) * pow(cloud, 2.4);
      float stars = dustStars((${v.position}.xy + world * .021) / 31.0);
      lit += stars * vec3(.46, .59, .78);
      outColor = vec4(lit, .74);
    }
  `,
};
