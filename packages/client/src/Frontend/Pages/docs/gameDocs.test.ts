import { describe, expect, it } from "vitest";

import { chapterHeadings, findChapter, gameDocs } from "./gameDocs";

describe("game docs", () => {
  it("gives every chapter a unique id and unique headings", () => {
    const ids = gameDocs.map((chapter) => chapter.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const chapter of gameDocs) {
      const headings = chapterHeadings(chapter).map((heading) => heading.id);
      expect(headings.length).toBeGreaterThan(0);
      expect(new Set(headings).size).toBe(headings.length);
    }
  });

  it("shows the space-type map in the map chapter", () => {
    const map = findChapter("map");
    expect(chapterHeadings(map).map((heading) => heading.id)).toContain(
      "space",
    );
    expect(map.blocks.some((block) => block.kind === "space-figure")).toBe(
      true,
    );
    const shares = map.blocks.find(
      (block) => block.kind === "table" && block.headers[0] === "空间",
    );
    expect(shares).toMatchObject({
      rows: [
        ["星云", "33.2%", "17.6%"],
        ["太空", "12.0%", "16.2%"],
        ["深空", "49.2%", "59.8%"],
        ["死空", "5.7%", "6.3%"],
      ],
    });
  });

  it("lists the level silver packs and the one-way discount", () => {
    const resources = findChapter("resources");
    const packs = resources.blocks.find(
      (block) => block.kind === "table" && block.headers[0] === "等级",
    );
    expect(packs).toMatchObject({
      headers: ["等级", "20%", "50%", "80%", "150%"],
      rows: expect.arrayContaining([
        ["1", "1000 / 20", "2500 / 50", "4000 / 80", "7500 / 150"],
        [
          "5",
          "34000 / 10000",
          "85000 / 25000",
          "135000 / 40000",
          "255000 / 75000",
        ],
      ]),
    });
    const discount = resources.blocks.find(
      (block) => block.kind === "table" && block.headers[0] === "进度",
    );
    expect(discount).toMatchObject({
      rows: expect.arrayContaining([["2", "1 级", "90%"]]),
    });
  });

  it("shows the energy growth formulas in resources", () => {
    const resources = findChapter("resources");
    expect(chapterHeadings(resources).map((heading) => heading.id)).toContain(
      "energy-curve",
    );
    expect(
      resources.blocks.some((block) => block.kind === "energy-figure"),
    ).toBe(true);
  });

  it("opens on the overview", () => {
    expect(gameDocs[0].id).toBe("overview");
    expect(findChapter(undefined).id).toBe("overview");
    expect(findChapter("missing").id).toBe("overview");
    expect(chapterHeadings(gameDocs[0]).map((heading) => heading.id)).toEqual([
      "nature",
      "goal",
      "round",
      "contracts",
      "season",
    ]);
  });
});
