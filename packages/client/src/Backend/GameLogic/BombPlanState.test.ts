import type { ArtifactId, LocationId } from "@df/types";
import { describe, expect, it } from "vitest";

import { BombPlanState } from "./BombPlanState";

const bombPlanet = "bomb-planet" as LocationId;
const otherPlanet = "other-planet" as LocationId;
const target = "target" as LocationId;
const newTarget = "new-target" as LocationId;
const bomb = "bomb-1" as ArtifactId;
const anotherBomb = "bomb-2" as ArtifactId;

describe("BombPlanState", () => {
  it("开始点选后进入选目标状态，还没有目标", () => {
    const state = new BombPlanState();
    state.startPicking(bombPlanet, bomb);
    expect(state.isPicking()).toBe(true);
    expect(state.get()).toEqual({
      planetId: bombPlanet,
      artifactId: bomb,
      picking: true,
      targetId: undefined,
    });
  });

  it("选定目标后结束点选，目标保留", () => {
    const state = new BombPlanState();
    state.startPicking(bombPlanet, bomb);
    state.chooseTarget(target);
    expect(state.isPicking()).toBe(false);
    expect(state.get()?.targetId).toBe(target);
  });

  it("没有进行中的方案时，选目标被忽略", () => {
    const state = new BombPlanState();
    state.chooseTarget(target);
    expect(state.get()).toBeUndefined();
  });

  it("一个目标都没有时取消点选，整个方案清掉", () => {
    const state = new BombPlanState();
    state.startPicking(bombPlanet, bomb);
    state.cancelPicking();
    expect(state.get()).toBeUndefined();
  });

  it("已有目标时取消点选，只停止点选、目标不丢", () => {
    const state = new BombPlanState();
    state.startPicking(bombPlanet, bomb);
    state.chooseTarget(target);
    state.startPicking(bombPlanet, bomb); // 重选目标
    expect(state.get()?.targetId).toBe(target);
    state.cancelPicking();
    expect(state.get()).toMatchObject({ picking: false, targetId: target });
  });

  it("重选时点了新目标，就换成新的", () => {
    const state = new BombPlanState();
    state.startPicking(bombPlanet, bomb);
    state.chooseTarget(target);
    state.startPicking(bombPlanet, bomb);
    state.chooseTarget(newTarget);
    expect(state.get()?.targetId).toBe(newTarget);
  });

  it("换一件神器开始点选时，不继承上一件的目标", () => {
    const state = new BombPlanState();
    state.startPicking(bombPlanet, bomb);
    state.chooseTarget(target);
    state.startPicking(bombPlanet, anotherBomb);
    expect(state.get()?.targetId).toBeUndefined();
  });

  describe("选中星球变化", () => {
    it("还是炸弹所在的星球时保留", () => {
      const state = new BombPlanState();
      state.startPicking(bombPlanet, bomb);
      state.keepOnlyForPlanet(bombPlanet);
      expect(state.get()).toBeDefined();
    });

    it("换到别的星球，或取消选中，就放弃这次选择", () => {
      const state = new BombPlanState();
      state.startPicking(bombPlanet, bomb);
      state.keepOnlyForPlanet(otherPlanet);
      expect(state.get()).toBeUndefined();

      state.startPicking(bombPlanet, bomb);
      state.keepOnlyForPlanet(undefined);
      expect(state.get()).toBeUndefined();
    });
  });

  it("每次变化都通知界面，没变化就不通知", () => {
    const state = new BombPlanState();
    const seen: (string | undefined)[] = [];
    state.changed$.subscribe((plan) => seen.push(plan?.targetId));

    state.startPicking(bombPlanet, bomb);
    state.chooseTarget(target);
    state.clear();
    state.clear(); // 已经是空的，不再通知
    expect(seen).toEqual([undefined, target, undefined]);
  });
});
