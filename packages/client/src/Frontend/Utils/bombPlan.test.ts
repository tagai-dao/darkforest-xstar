import type { LocationId, Planet } from "@df/types";
import { describe, expect, it } from "vitest";

import {
  BOMB_DESTROY_WINDOW,
  bombBlastRadius,
  bombDestroyWindowOpen,
  bombPhase,
  bombReachRadius,
  bombSteps,
  launchedBombStillUsable,
  planetsInBlast,
  resolveBombTarget,
  sortByCoords,
} from "./bombPlan";

const planetOf = (energy: number, energyCap: number, range: number) =>
  ({ energy, energyCap, range }) as Planet;

describe("bombReachRadius", () => {
  it("能量满时：射程 × log2(20) × 0.5（激活时射程减半）", () => {
    const reach = bombReachRadius(planetOf(1000, 1000, 100));
    expect(reach).toBeCloseTo(Math.log2(20) * 100 * 0.5);
  });

  it("能量越少飞得越近", () => {
    const full = bombReachRadius(planetOf(1000, 1000, 100));
    const half = bombReachRadius(planetOf(500, 1000, 100));
    expect(half).toBeLessThan(full);
    expect(half).toBeCloseTo(Math.log2(10) * 100 * 0.5);
  });

  it("能量不到上限的 5% 时，一格也飞不出去", () => {
    expect(bombReachRadius(planetOf(40, 1000, 100))).toBe(0);
  });

  it("能量上限为 0 时不算，避免除零", () => {
    expect(bombReachRadius(planetOf(10, 0, 100))).toBe(0);
  });
});

describe("bombBlastRadius", () => {
  it("每一档稀有度加 500", () => {
    expect([1, 2, 3, 4, 5].map(bombBlastRadius)).toEqual([
      500, 1000, 1500, 2000, 2500,
    ]);
  });
});

describe("resolveBombTarget", () => {
  const mine = "mine" as LocationId;
  const onChain = "chain" as LocationId;

  it("待用时用界面上刚选的，忽略链上可能残留的旧目标", () => {
    expect(
      resolveBombTarget({ status: 0, planTarget: mine, chainTarget: onChain }),
    ).toBe(mine);
  });

  it("开始充能后以链上为准", () => {
    expect(
      resolveBombTarget({ status: 2, planTarget: mine, chainTarget: onChain }),
    ).toBe(onChain);
  });

  it("充能后链上还没读到时，先用界面上的", () => {
    expect(resolveBombTarget({ status: 2, planTarget: mine })).toBe(mine);
  });

  it("两边都没有就是没选", () => {
    expect(resolveBombTarget({ status: 0 })).toBeUndefined();
  });
});

describe("bombPhase", () => {
  const base = { hasTarget: true, arrivalTick: 0, nowTick: 1000 };
  const charging = (remainingTicks: number) => ({
    label: "充能" as const,
    ratio: 0.5,
    remainingTicks,
  });

  it("没选目标是 pick，选了目标是 charge", () => {
    expect(bombPhase({ ...base, status: 0, hasTarget: false })).toBe("pick");
    expect(bombPhase({ ...base, status: 0 })).toBe("charge");
  });

  it("充能中，时间走完后当作可激活", () => {
    expect(bombPhase({ ...base, status: 2, charging: charging(10) })).toBe(
      "charging",
    );
    expect(bombPhase({ ...base, status: 2, charging: charging(0) })).toBe(
      "launch",
    );
  });

  it("链上状态是可激活就是 launch", () => {
    expect(bombPhase({ ...base, status: 3 })).toBe("launch");
  });

  it("冷却中单独成一个阶段", () => {
    expect(bombPhase({ ...base, status: 1 })).toBe("cooldown");
  });

  describe("发射之后按到达时间划分", () => {
    const launched = { ...base, status: 4, arrivalTick: 5000 };

    it("到达之前是飞行中", () => {
      expect(bombPhase({ ...launched, nowTick: 4999 })).toBe("flying");
    });

    it("到达那一刻起窗口打开", () => {
      expect(bombPhase({ ...launched, nowTick: 5000 })).toBe("destroy");
    });

    it("窗口最后一个 tick 还能摧毁，再过一个就过期", () => {
      const last = 5000 + BOMB_DESTROY_WINDOW - 1;
      expect(bombPhase({ ...launched, nowTick: last })).toBe("destroy");
      expect(bombPhase({ ...launched, nowTick: last + 1 })).toBe("expired");
    });

    it("神器已标成损坏时，仍按到达时间判断窗口", () => {
      expect(bombPhase({ ...launched, status: 5, nowTick: 5100 })).toBe(
        "destroy",
      );
    });
  });

  it("损坏且没有飞行记录就是 broken", () => {
    expect(bombPhase({ ...base, status: 5 })).toBe("broken");
  });
});

describe("sortByCoords", () => {
  const at = (x: number, y: number) => ({ location: { coords: { x, y } } });

  it("先按 x 升序，x 相同再按 y 升序", () => {
    const sorted = sortByCoords([at(5, 9), at(-3, 7), at(5, -2), at(-3, 1)]);
    expect(
      sorted.map((item) => [item.location.coords.x, item.location.coords.y]),
    ).toEqual([
      [-3, 1],
      [-3, 7],
      [5, -2],
      [5, 9],
    ]);
  });

  it("不修改传入的数组", () => {
    const input = [at(2, 0), at(1, 0)];
    sortByCoords(input);
    expect(input[0].location.coords.x).toBe(2);
  });
});

describe("bombDestroyWindowOpen", () => {
  it("没发射、还在飞、窗口已过都不能摧毁", () => {
    expect(bombDestroyWindowOpen(0, 100)).toBe(false);
    expect(bombDestroyWindowOpen(5000, 4999)).toBe(false);
    expect(bombDestroyWindowOpen(5000, 5000 + BOMB_DESTROY_WINDOW)).toBe(false);
  });

  it("到达那一刻起到窗口最后一个 tick 都能摧毁", () => {
    expect(bombDestroyWindowOpen(5000, 5000)).toBe(true);
    expect(bombDestroyWindowOpen(5000, 5000 + BOMB_DESTROY_WINDOW - 1)).toBe(
      true,
    );
  });
});

describe("launchedBombStillUsable", () => {
  it("没发射过（到达 tick 为 0）不算", () => {
    expect(launchedBombStillUsable(0, 100)).toBe(false);
  });

  it("飞行中继续显示", () => {
    expect(launchedBombStillUsable(5000, 4000)).toBe(true);
  });

  it("到达后窗口内继续显示，最后一个 tick 也算", () => {
    expect(launchedBombStillUsable(5000, 5000)).toBe(true);
    expect(launchedBombStillUsable(5000, 5000 + BOMB_DESTROY_WINDOW - 1)).toBe(
      true,
    );
  });

  it("窗口过了就不再显示", () => {
    expect(launchedBombStillUsable(5000, 5000 + BOMB_DESTROY_WINDOW)).toBe(
      false,
    );
  });
});

describe("bombSteps", () => {
  const states = (phase: Parameters<typeof bombSteps>[0]) =>
    bombSteps(phase).map((step) => step.state);

  it("固定四步：选目标、充能、激活、摧毁", () => {
    expect(bombSteps("pick").map((step) => step.label)).toEqual([
      "选目标",
      "充能",
      "激活",
      "摧毁",
    ]);
  });

  it("走到哪步，前面的算完成，后面的算未开始", () => {
    expect(states("pick")).toEqual(["active", "todo", "todo", "todo"]);
    expect(states("charge")).toEqual(["done", "active", "todo", "todo"]);
    expect(states("charging")).toEqual(["done", "active", "todo", "todo"]);
    expect(states("launch")).toEqual(["done", "done", "active", "todo"]);
    expect(states("flying")).toEqual(["done", "done", "active", "todo"]);
    expect(states("destroy")).toEqual(["done", "done", "done", "active"]);
  });

  it("窗口过期时，最后一步标成过期", () => {
    expect(states("expired")).toEqual(["done", "done", "done", "expired"]);
  });

  it("冷却中哪一步都不在进行", () => {
    expect(states("cooldown")).toEqual(["todo", "todo", "todo", "todo"]);
  });
});

describe("planetsInBlast", () => {
  const at = (x: number, y: number) => ({ location: { coords: { x, y } } });

  it("只留半径以内的，按离中心从近到远排", () => {
    const far = at(900, 0);
    const near = at(100, 0);
    const center = at(0, 0);
    const edge = at(500, 0);
    const result = planetsInBlast(
      [far, near, center, edge],
      { x: 0, y: 0 },
      500,
    );
    expect(result).toEqual([center, near, edge]);
  });
});
