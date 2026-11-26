import { describe, expect, it } from "vitest";

import {
  actionTextParts,
  aiproPriceLabel,
  formatActionTime,
} from "../../Frontend/Components/ActionHistory";
import { asActionRecord, parseCompleteJsonLines } from "./FileChunkSource";

describe("action log", () => {
  it("keeps the strategy filename on a complete line", () => {
    const line =
      '{"time":"t","strategy":"aggressive.md","action":"buy-silver","detail":"tier 0","tx":"0x1"}\n';
    const parsed = parseCompleteJsonLines(`${line}{"action":"cut`);
    expect(parsed.byteLength).toBe(line.length);
    expect(asActionRecord(parsed.values[0])?.strategy).toBe("aggressive.md");
  });

  it("reads a time written under at", () => {
    const parsed = parseCompleteJsonLines(
      '{"at":"2026-11-06T04:51:48Z","strategy":"aggressive.md","action":"tick"}\n',
    );
    expect(asActionRecord(parsed.values[0])?.time).toBe("2026-11-06T04:51:48Z");
  });

  it("renders imported structured details alongside valid coordinate links", () => {
    const entries = [
      {
        action: "move",
        detail: { from: "(79908, 14)", energy: 1200 },
        strategy: { name: "aggressive.md" },
        time: 123,
        at: "2026-11-06T04:51:48Z",
        tx: {},
      },
      { action: "upgrade", detail: "upgraded (79954, -137)" },
      { action: "tick", detail: null },
    ];
    const log = entries.map((entry) => JSON.stringify(entry)).join("\n");
    const parsed = parseCompleteJsonLines(`${log}\n`);
    const records = parsed.values.map(asActionRecord);
    const parts = records.map((record) =>
      actionTextParts(record?.detail ?? ""),
    );

    expect(records[0]).toMatchObject({
      action: "move",
      detail: '{"from":"(79908, 14)","energy":1200}',
      time: "2026-11-06T04:51:48Z",
    });
    expect(records[0]?.strategy).toBeUndefined();
    expect(records[0]?.tx).toBeUndefined();
    expect(parts[0]).toContainEqual({
      kind: "coord",
      x: 79908,
      y: 14,
      label: "(79908, 14)",
    });
    expect(parts[1]).toEqual([
      { kind: "text", value: "upgraded " },
      { kind: "coord", x: 79954, y: -137, label: "(79954, -137)" },
    ]);
    expect(parts[2]).toEqual([]);
  });

  it("labels an action with the local time", () => {
    const source = "2026-11-05T08:34:00.000Z";
    const date = new Date(source);
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");
    expect(formatActionTime(source)).toContain(`${hour}:${minute}`);
    expect(formatActionTime(undefined)).toBe("时间未知");
  });

  it("splits planet coordinates out of an action line", () => {
    const parts = actionTextParts(
      "aggressive.md move capture (79954, -137) from (79908, 14)",
    );
    expect(parts.filter((part) => part.kind === "coord")).toEqual([
      { kind: "coord", x: 79954, y: -137, label: "(79954, -137)" },
      { kind: "coord", x: 79908, y: 14, label: "(79908, 14)" },
    ]);
    expect(actionTextParts("buy-silver tier 0")).toEqual([
      { kind: "text", value: "buy-silver tier 0" },
    ]);
  });

  it("shows the empty price hook as not connected", () => {
    expect(
      aiproPriceLabel('{"token":"AIPRO","source":null,"price":null}'),
    ).toBe("价格未接入");
    expect(aiproPriceLabel('{"price":1.25}')).toBe("1.25");
  });
});
