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
