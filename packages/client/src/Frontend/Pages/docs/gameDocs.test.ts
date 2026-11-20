import { MaterialType } from "@df/types";
import { describe, expect, it } from "vitest";

import { getMaterialColor } from "../../Utils/materialColor";
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
    expect(chapterHeadings(map).map((heading) => heading.id)).toContain(
      "biomes",
    );
    expect(map.blocks.some((block) => block.kind === "biome-figure")).toBe(
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
    const buy = resources.blocks.find(
      (block) => block.kind === "p" && block.text.includes("直接销毁"),
    );
    const buyText = buy && buy.kind === "p" ? buy.text : "";
    expect(buyText).toContain(
      "购买使用的 AIPRO 中有 50% 会直接销毁，50% 会分给游戏的积分排行榜，由玩家瓜分。",
    );
    expect(buyText).not.toContain("销毁地址");
    expect(buyText).not.toContain("管理员");
    const discount = resources.blocks.find(
      (block) => block.kind === "table" && block.headers[0] === "进度",
    );
    expect(discount).toMatchObject({
      rows: expect.arrayContaining([["2", "1 级", "90%"]]),
    });
  });

  it("lists the innate stat doubles after the planet type", () => {
    const planets = findChapter("planets");
    const table = planets.blocks.find(
      (block) => block.kind === "table" && block.headers[0] === "属性",
    );
    expect(table).toMatchObject({
      headers: ["属性", "加成"],
      rows: [
        ["能量上限", "200%"],
        ["能量成长", "200%"],
        ["射程", "200%"],
        ["速度", "200%"],
        ["防御", "200%"],
      ],
    });
  });

  it("explains the foundry prospect window", () => {
    const planets = findChapter("planets");
    expect(chapterHeadings(planets).map((heading) => heading.id)).toContain(
      "prospect",
    );
    const text = planets.blocks
      .flatMap((block) => (block.kind === "p" ? [block.text] : []))
      .join("\n");
    expect(text).toContain("其后第 256 个区块");
    expect(text).toContain("可以重新勘探");
  });

  it("colors material names with the in-game colors", () => {
    const resources = findChapter("resources");
    const table = resources.blocks.find(
      (block) => block.kind === "table" && block.headers[1] === "材料",
    );
    expect(table && table.kind === "table" ? table.rows[1][1] : null).toEqual({
      text: "水晶体（Water Crystals）",
      color: getMaterialColor(MaterialType.WATER_CRYSTALS),
    });
    expect(table && table.kind === "table" ? table.rows[11][1] : null).toEqual({
      text: "腐化水晶（Corrupted Crystal）",
      color: getMaterialColor(MaterialType.CORRUPTED_CRYSTAL),
    });
    const note = resources.blocks.find((block) => block.kind === "rich");
    const names =
      note && note.kind === "rich"
        ? note.parts.flatMap((part) => (typeof part === "string" ? [] : [part]))
        : [];
    expect(names.map((part) => part.color)).toEqual([
      getMaterialColor(MaterialType.BLACKALLOY),
      getMaterialColor(MaterialType.CORRUPTED_CRYSTAL),
      getMaterialColor(MaterialType.WATER_CRYSTALS),
      getMaterialColor(MaterialType.LIVING_WOOD),
      getMaterialColor(MaterialType.WINDSTEEL),
      getMaterialColor(MaterialType.AURORIUM),
      getMaterialColor(MaterialType.MYCELIUM),
      getMaterialColor(MaterialType.SANDGLASS),
      getMaterialColor(MaterialType.CRYOSTONE),
      getMaterialColor(MaterialType.SCRAPIUM),
      getMaterialColor(MaterialType.PYROSTEEL),
    ]);
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

  it("lists artifact numbers by rarity", () => {
    const more = findChapter("more");
    const cannon = more.blocks.find(
      (block) => block.kind === "table" && block.headers[1] === "充能时防御",
    );
    expect(cannon).toMatchObject({
      rows: expect.arrayContaining([
        ["普通", "50%", "200%", "500%"],
        ["神话", "10%", "200%", "2500%"],
      ]),
    });
    const wormhole = more.blocks.find(
      (block) => block.kind === "table" && block.headers[1] === "距离系数",
    );
    expect(wormhole).toMatchObject({
      rows: expect.arrayContaining([
        ["传说", "62"],
        ["神话", "31"],
      ]),
    });
    const bomb = more.blocks.find(
      (block) => block.kind === "table" && block.headers[2] === "摧毁半径",
    );
    expect(bomb).toMatchObject({
      rows: expect.arrayContaining([["史诗", "4 到 6", "1500"]]),
    });
  });

  it("lists the junk limit prices for tiers up to 20,000", () => {
    const junk = findChapter("junk");
    const table = junk.blocks.find(
      (block) => block.kind === "table" && block.headers[0] === "档位",
    );
    const rows = table && table.kind === "table" ? table.rows : [];

    expect(rows).toHaveLength(20);
    expect(rows[0]).toEqual(["1", "1000", "0.000", "—"]);
    expect(rows[1]).toEqual(["2", "2000", "0.003", "0.003"]);
    expect(rows[8]).toEqual(["9", "9000", "0.024", "0.003"]);
    expect(rows[9]).toEqual(["10", "10000", "0.033", "0.009"]);
    expect(rows[19]).toEqual(["20", "20000", "0.453", "0.069"]);
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
      "entry",
    ]);
  });
});
