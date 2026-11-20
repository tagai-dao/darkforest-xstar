import type { ArtifactId, LocationId } from "@df/types";
import { describe, expect, it } from "vitest";

import { BombVictimState } from "./BombVictimState";

const bombPlanet = "bomb-planet" as LocationId;
const otherPlanet = "other-planet" as LocationId;
const victimA = "victim-a" as LocationId;
const victimB = "victim-b" as LocationId;
const bomb = "bomb-1" as ArtifactId;
const anotherBomb = "bomb-2" as ArtifactId;

describe("BombVictimState", () => {
  it("开始点选后进入点选状态，还没有受害星球", () => {
    const state = new BombVictimState();
    state.startPicking(bombPlanet, bomb);
    expect(state.isPicking()).toBe(true);
    expect(state.get()?.victimId).toBeUndefined();
  });

  it("选定后结束点选，并清掉之前的拒绝提示", () => {
    const state = new BombVictimState();
    state.startPicking(bombPlanet, bomb);
    state.reject(victimB);
    state.choose(bombPlanet, bomb, victimA);
    expect(state.isPicking()).toBe(false);
    expect(state.get()).toEqual({
      planetId: bombPlanet,
      artifactId: bomb,
      picking: false,
      victimId: victimA,
    });
  });

  it("点到不能摧毁的星球：记下提示，仍在点选", () => {
    const state = new BombVictimState();
    state.startPicking(bombPlanet, bomb);
    state.reject(victimB);
    expect(state.isPicking()).toBe(true);
    expect(state.get()?.rejectedId).toBe(victimB);
  });

  it("没有进行中的选择时，拒绝被忽略", () => {
    const state = new BombVictimState();
    state.reject(victimB);
    expect(state.get()).toBeUndefined();
  });

  it("取消点选保留已选的星球", () => {
    const state = new BombVictimState();
    state.choose(bombPlanet, bomb, victimA);
    state.startPicking(bombPlanet, bomb);
    state.cancelPicking();
    expect(state.isPicking()).toBe(false);
    expect(state.get()?.victimId).toBe(victimA);
  });

  it("同一件炸弹重新点选保留已选；换炸弹从头来", () => {
    const state = new BombVictimState();
    state.choose(bombPlanet, bomb, victimA);
    state.startPicking(bombPlanet, bomb);
    expect(state.get()?.victimId).toBe(victimA);
    state.startPicking(bombPlanet, anotherBomb);
    expect(state.get()?.victimId).toBeUndefined();
  });

  it("选中别的星球就放弃，选中出发星球则保留", () => {
    const state = new BombVictimState();
    state.choose(bombPlanet, bomb, victimA);
    state.keepOnlyForPlanet(bombPlanet);
    expect(state.get()).toBeDefined();
    state.keepOnlyForPlanet(otherPlanet);
    expect(state.get()).toBeUndefined();
  });

  it("状态变化会通知界面", () => {
    const state = new BombVictimState();
    let count = 0;
    state.changed$.subscribe(() => count++);
    state.startPicking(bombPlanet, bomb);
    state.choose(bombPlanet, bomb, victimA);
    state.clear();
    expect(count).toBe(3);
  });
});
