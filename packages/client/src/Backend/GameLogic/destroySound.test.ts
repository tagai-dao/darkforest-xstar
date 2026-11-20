import { describe, expect, it } from "vitest";

import { isNewlyDestroyed } from "./destroySound";

describe("isNewlyDestroyed", () => {
  it("从没摧毁变成摧毁时响", () => {
    expect(isNewlyDestroyed(false, true)).toBe(true);
  });

  it("打开页面时第一次见到就已经摧毁的，不响", () => {
    expect(isNewlyDestroyed(undefined, true)).toBe(false);
  });

  it("本来就摧毁的，再次同步时不重复响", () => {
    expect(isNewlyDestroyed(true, true)).toBe(false);
  });

  it("没有摧毁的，普通更新不响", () => {
    expect(isNewlyDestroyed(false, false)).toBe(false);
  });

  it("摧毁状态没有读到时不响", () => {
    expect(isNewlyDestroyed(false, undefined)).toBe(false);
  });
});
