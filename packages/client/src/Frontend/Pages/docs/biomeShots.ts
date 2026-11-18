import { getPlanetCosmetic, hslToRgb } from "@df/procedural";
import {
  type Biome,
  type LocationId,
  type Planet,
  PlanetLevel,
  type RGBVec,
  SpaceType,
} from "@df/types";

import { EngineUtils } from "../../../Shared/renderer/EngineUtils";
import { MINE_PROGRAM_DEFINITION } from "../../../Shared/renderer/Programs/MineProgram";
import {
  distortFromPlanet,
  PLANET_PROGRAM_DEFINITION,
  propsFromPlanet,
} from "../../../Shared/renderer/Programs/PlanetProgram";
import { QUASARBODY_PROGRAM_DEFINITION } from "../../../Shared/renderer/Programs/QuasarBodyProgram";
import { QUASARRAY_PROGRAM_DEFINITION } from "../../../Shared/renderer/Programs/QuasarRayProgram";
import { RUINS_PROGRAM_DEFINITION } from "../../../Shared/renderer/Programs/RuinsProgram";
import { SPACETIMERIP_PROGRAM_DEFINITION } from "../../../Shared/renderer/Programs/SpacetimeRipProgram";
import { ProgramUtils } from "../../../Shared/renderer/WebGL/ProgramUtils";

/** 第一列从左到右的五种图案。 */
export const TYPE_SHOTS = [
  { key: "planet", label: "行星" },
  { key: "mine", label: "小行星带" },
  { key: "foundry", label: "铸造厂" },
  { key: "rip", label: "时空裂隙" },
  { key: "quasar", label: "类星体" },
] as const;

export type TypeShotKey = (typeof TYPE_SHOTS)[number]["key"];
export type TypeShot = Record<TypeShotKey, string>;

const SIZE = 128;
// 类星体在游戏里一直转。停在这个角度，盘面和光带都看得到。
const QUASAR_ANGLE = 0.7;
const RECT = EngineUtils.makeQuadVec2(-1, 1, 1, -1);
const RAY_TOP = EngineUtils.makeQuadVec2(-1, 1, 1, 0);
const RAY_BOT = EngineUtils.makeQuadVec2(-1, 0, 1, -1);

type GlProgram = {
  vertexShader: string;
  fragmentShader: string;
};

function previewPlanet(biome: Biome, spaceType: SpaceType): Planet {
  return {
    locationId: `111111111${biome}` as LocationId,
    location: {},
    biome,
    spaceType,
    planetLevel: PlanetLevel.FOUR,
  } as Planet;
}

function compile(
  gl: WebGL2RenderingContext,
  source: GlProgram,
): WebGLProgram | null {
  return ProgramUtils.programFromSources(
    gl,
    source.vertexShader,
    source.fragmentShader,
  );
}

/** 像素坐标到裁剪空间，y 向下。 */
function ortho(size: number): Float32Array {
  const scale = 2 / size;
  return new Float32Array([
    scale,
    0,
    0,
    0,
    0,
    -scale,
    0,
    0,
    0,
    0,
    -1,
    0,
    -1,
    1,
    0,
    1,
  ]);
}

function silenceAttribs(gl: WebGL2RenderingContext) {
  const count = gl.getParameter(gl.MAX_VERTEX_ATTRIBS) as number;
  for (let index = 0; index < count; index += 1) {
    gl.disableVertexAttribArray(index);
  }
}

function clearCanvas(gl: WebGL2RenderingContext) {
  gl.viewport(0, 0, SIZE, SIZE);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.clearColor(7 / 255, 11 / 255, 12 / 255, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

function color4(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string,
  rgb: RGBVec,
) {
  const location = gl.getAttribLocation(program, name);
  if (location < 0) return;
  gl.vertexAttrib4f(location, rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, 1);
}

function bindBuffer(
  gl: WebGL2RenderingContext,
  location: number,
  data: BufferSource,
  size: number,
  type: number,
  normalize: boolean,
) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, size, type, normalize, 0, 0);
  return buffer;
}

function drawPlanet(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  planet: Planet,
) {
  const cosmetic = getPlanetCosmetic(planet);
  const [octaves, clouds, morph, beach] = propsFromPlanet(planet);
  const corner = (x: number, y: number) => [x, y, 0, x, y];
  silenceAttribs(gl);
  gl.useProgram(program);
  clearCanvas(gl);

  const position = gl.getAttribLocation(program, "a_position");
  const rect = gl.getAttribLocation(program, "a_rectPos");
  // 每个顶点是 position.xyz 加 rectPos.xy，步长 20 字节。
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      ...corner(-1, -1),
      ...corner(1, -1),
      ...corner(-1, 1),
      ...corner(-1, 1),
      ...corner(1, -1),
      ...corner(1, 1),
    ]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 20, 0);
  gl.enableVertexAttribArray(rect);
  gl.vertexAttribPointer(rect, 2, gl.FLOAT, false, 20, 12);

  color4(gl, program, "a_color", cosmetic.landRgb);
  color4(gl, program, "a_color2", cosmetic.oceanRgb);
  color4(gl, program, "a_color3", cosmetic.beachRgb);
  gl.vertexAttrib4f(
    gl.getAttribLocation(program, "a_props"),
    octaves,
    clouds,
    morph,
    beach,
  );
  gl.vertexAttrib4f(
    gl.getAttribLocation(program, "a_props2"),
    cosmetic.seed,
    1 / 56,
    1,
    distortFromPlanet(planet),
  );

  const identity = new Float32Array([
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
  ]);
  gl.uniformMatrix4fv(
    gl.getUniformLocation(program, "u_matrix"),
    false,
    identity,
  );
  gl.uniformMatrix4fv(
    gl.getUniformLocation(program, "u_timeMatrix"),
    false,
    identity,
  );
  gl.uniform1f(gl.getUniformLocation(program, "u_time"), 0);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

function drawMine(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  planet: Planet,
) {
  const cosmetic = getPlanetCosmetic(planet);
  const count = planet.planetLevel + 1;
  const interval = (2 * Math.PI) / count;
  const [hue, sat, light] = cosmetic.asteroidHsl;
  const radius = SIZE * 0.34;
  const center = SIZE / 2;
  const positions = new Float32Array(count * 3);
  const colors = new Uint8Array(count * 3);
  const radii = new Float32Array(count);
  const seeds = new Float32Array(count);
  const offsets = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    const rand1 = ((cosmetic.seed + 1741 * index) % 5) / 5;
    const rand2 = ((cosmetic.seed + 1741 * (index + 10)) % 5) / 5;
    const color = hslToRgb([
      hue,
      sat - 20 + rand1 * 40,
      light - 20 + rand2 * 40,
    ]);
    positions.set([center, center, 0], index * 3);
    colors.set(color, index * 3);
    radii[index] = radius;
    seeds[index] = cosmetic.seed + index;
    offsets[index] = index * interval;
  }

  silenceAttribs(gl);
  gl.useProgram(program);
  clearCanvas(gl);
  gl.uniformMatrix4fv(
    gl.getUniformLocation(program, "u_matrix"),
    false,
    ortho(SIZE),
  );
  gl.uniform1f(gl.getUniformLocation(program, "u_now"), 0);
  bindBuffer(
    gl,
    gl.getAttribLocation(program, "a_position"),
    positions,
    3,
    gl.FLOAT,
    false,
  );
  bindBuffer(
    gl,
    gl.getAttribLocation(program, "a_color"),
    colors,
    3,
    gl.UNSIGNED_BYTE,
    true,
  );
  bindBuffer(
    gl,
    gl.getAttribLocation(program, "a_radius"),
    radii,
    1,
    gl.FLOAT,
    false,
  );
  bindBuffer(
    gl,
    gl.getAttribLocation(program, "a_seed"),
    seeds,
    1,
    gl.FLOAT,
    false,
  );
  bindBuffer(
    gl,
    gl.getAttribLocation(program, "a_offset"),
    offsets,
    1,
    gl.FLOAT,
    false,
  );
  gl.drawArrays(gl.POINTS, 0, count);
}

function drawQuad(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  positions: number[],
  rect: number[],
) {
  bindBuffer(
    gl,
    gl.getAttribLocation(program, "a_position"),
    new Float32Array(positions),
    3,
    gl.FLOAT,
    false,
  );
  bindBuffer(
    gl,
    gl.getAttribLocation(program, "a_rectPos"),
    new Float32Array(rect),
    2,
    gl.FLOAT,
    false,
  );
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

function drawFoundry(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  planet: Planet,
) {
  const cosmetic = getPlanetCosmetic(planet);
  const colors = [cosmetic.baseColor, cosmetic.baseColor2, cosmetic.baseColor3];
  const center = SIZE / 2;
  const radius = SIZE * 0.42;
  const interval = 1 / (planet.planetLevel + 1);

  silenceAttribs(gl);
  gl.useProgram(program);
  clearCanvas(gl);
  gl.uniformMatrix4fv(
    gl.getUniformLocation(program, "u_matrix"),
    false,
    ortho(SIZE),
  );
  gl.uniform1f(gl.getUniformLocation(program, "u_time"), 0);
  if (!cosmetic.ruins) return;

  for (let index = 0; index < planet.planetLevel + 1; index += 1) {
    const bloom = cosmetic.ruins[index as PlanetLevel];
    // 游戏会改缓存里的 props[0]，这里复制一份，避免污染后面的图案。
    const props: [number, number, number, number] = [...bloom.props];
    props[0] = index + 2;
    const reach = (index + 1) * interval * radius;
    const quad = EngineUtils.makeEmptyQuad();
    EngineUtils.makeQuadBuffered(
      quad,
      center - reach,
      center - reach,
      center + reach,
      center + reach,
      0,
    );
    gl.vertexAttrib4f(
      gl.getAttribLocation(program, "a_weights"),
      ...bloom.weights,
    );
    gl.vertexAttrib4f(gl.getAttribLocation(program, "a_props"), ...props);
    color4(gl, program, "a_color", colors[index % 3]);
    drawQuad(gl, program, quad, RECT);
  }
}

function spaceColor(spaceType: SpaceType): RGBVec {
  if (spaceType === SpaceType.SPACE) return [0, 5, 43];
  if (spaceType === SpaceType.DEEP_SPACE) return [2, 0, 6];
  if (spaceType === SpaceType.DEAD_SPACE) return [0, 36, 0];
  return [0, 24, 122];
}

function drawRip(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  planet: Planet,
) {
  const cosmetic = getPlanetCosmetic(planet);
  const reach = SIZE * 0.26 * 1.7;
  const center = SIZE / 2;
  const quad = EngineUtils.makeEmptyQuad();
  EngineUtils.makeQuadBuffered(
    quad,
    center - reach,
    center - reach,
    center + reach,
    center + reach,
    0,
  );

  silenceAttribs(gl);
  gl.useProgram(program);
  clearCanvas(gl);
  gl.uniformMatrix4fv(
    gl.getUniformLocation(program, "u_matrix"),
    false,
    ortho(SIZE),
  );
  gl.uniform1f(gl.getUniformLocation(program, "u_time"), 0);
  color4(gl, program, "a_color", spaceColor(planet.spaceType));
  color4(gl, program, "a_inColor1", cosmetic.spacetime1);
  color4(gl, program, "a_inColor2", cosmetic.spacetime2);
  color4(gl, program, "a_inColor3", cosmetic.spacetime3);
  drawQuad(gl, program, quad, RECT);
}

function drawQuasar(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  rays: WebGLProgram,
  planet: Planet,
) {
  const cosmetic = getPlanetCosmetic(planet);
  const center = SIZE / 2;
  const radius = SIZE * 0.22;
  const tilt = Math.sin(QUASAR_ANGLE) * (Math.PI / 6);

  silenceAttribs(gl);
  clearCanvas(gl);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.useProgram(rays);
  gl.uniformMatrix4fv(
    gl.getUniformLocation(rays, "u_matrix"),
    false,
    ortho(SIZE),
  );
  gl.uniform1f(gl.getUniformLocation(rays, "u_time"), 0);
  color4(gl, rays, "a_color", cosmetic.landRgb);

  const facTop = 0.93 + Math.cos(QUASAR_ANGLE + Math.PI) * 0.07;
  const facBot = 0.93 + Math.cos(QUASAR_ANGLE) * 0.07;
  const beams = [
    { top: true, rect: RAY_TOP, x: radius * facBot, y: 2 * radius * facBot },
    { top: false, rect: RAY_BOT, x: radius * facTop, y: 2 * radius * facTop },
  ];
  for (const beam of beams) {
    const quad = EngineUtils.makeEmptyQuad();
    const y1 = beam.top ? -beam.y : 0;
    const y2 = beam.top ? 0 : beam.y;
    EngineUtils.makeQuadBuffered(quad, -beam.x, y1, beam.x, y2, 0);
    EngineUtils.rotateQuad(quad, tilt);
    EngineUtils.translateQuad(quad, [center, center]);
    drawQuad(gl, rays, quad, beam.rect);
  }

  const height = radius * (0.65 + Math.cos(QUASAR_ANGLE) * 0.35);
  const body = EngineUtils.makeEmptyQuad();
  EngineUtils.makeQuadBuffered(body, -radius, -height, radius, height, 0);
  EngineUtils.rotateQuad(body, tilt);
  EngineUtils.translateQuad(body, [center, center]);
  silenceAttribs(gl);
  gl.useProgram(program);
  gl.uniformMatrix4fv(
    gl.getUniformLocation(program, "u_matrix"),
    false,
    ortho(SIZE),
  );
  gl.uniform1f(gl.getUniformLocation(program, "u_time"), 0);
  color4(gl, program, "a_color", cosmetic.oceanRgb);
  drawQuad(gl, program, body, RECT);
}

/** 每个生态画五种星球。失败时 shots 为空，error 给表格说明。 */
export function renderBiomeCatalog(
  entries: { biome: Biome; spaceType: SpaceType }[],
): { shots: Record<number, TypeShot>; error: string } {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  if (!gl) return { shots: {}, error: "没有 WebGL2" };

  const planet = compile(gl, PLANET_PROGRAM_DEFINITION);
  const mine = compile(gl, MINE_PROGRAM_DEFINITION);
  const foundry = compile(gl, RUINS_PROGRAM_DEFINITION);
  const rip = compile(gl, SPACETIMERIP_PROGRAM_DEFINITION);
  const quasar = compile(gl, QUASARBODY_PROGRAM_DEFINITION);
  const rays = compile(gl, QUASARRAY_PROGRAM_DEFINITION);
  if (!planet || !mine || !foundry || !rip || !quasar || !rays) {
    return { shots: {}, error: "星球着色器没有编译成功" };
  }

  const shots: Record<number, TypeShot> = {};
  for (const entry of entries) {
    const body = previewPlanet(entry.biome, entry.spaceType);
    const shot = {} as TypeShot;
    drawPlanet(gl, planet, body);
    shot.planet = canvas.toDataURL("image/png");
    drawMine(gl, mine, body);
    shot.mine = canvas.toDataURL("image/png");
    drawFoundry(gl, foundry, body);
    shot.foundry = canvas.toDataURL("image/png");
    drawRip(gl, rip, body);
    shot.rip = canvas.toDataURL("image/png");
    drawQuasar(gl, quasar, rays, body);
    shot.quasar = canvas.toDataURL("image/png");
    shots[entry.biome] = shot;
  }
  return { shots, error: "" };
}
