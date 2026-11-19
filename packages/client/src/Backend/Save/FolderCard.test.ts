import { describe, expect, it } from "vitest";

import { folderCardFromFiles } from "./FolderCard";

describe("folder card", () => {
  it("reads the wallet, chain, home, and price without the map", () => {
    const card = folderCardFromFiles("0xabc", {
      agent: '{"address":"0xbe09885633Df7DfEfB96517cd6547fd4516A2907"}',
      game: '{"chainId":31337,"world":"0xbe09885633Df7DfEfB96517cd6547fd4516A2907"}',
      homes: '[{"coords":{"x":12,"y":-4},"hash":"1","perlin":1,"biomebase":1}]',
      price: '{"token":"AIPRO","price":null}',
    });

    expect(card.address).toBe("0xbe09885633df7dfefb96517cd6547fd4516a2907");
    expect(card.chainId).toBe(31337);
    expect(card.homeX).toBe(12);
    expect(card.homeY).toBe(-4);
    expect(card.priceText).toContain("AIPRO");
  });

  it("keeps the folder name when the small files are missing or broken", () => {
    const card = folderCardFromFiles("wallet", {
      agent: "{",
      game: "{}",
      homes: "[]",
    });

    expect(card.folderName).toBe("wallet");
    expect(card.address).toBeUndefined();
    expect(card.chainId).toBeUndefined();
    expect(card.homeX).toBeUndefined();
  });
});
