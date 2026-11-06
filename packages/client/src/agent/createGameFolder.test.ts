import { describe, expect, it } from "vitest";

import { ensureWalletFolder } from "./createGameFolder";

describe("ensureWalletFolder", () => {
  it("creates a folder once for the connected wallet", async () => {
    const written = new Map<string, string>();
    const writer = {
      exists: async (path: string) => written.has(path),
      writeNew: async (path: string, body: string) => {
        written.set(path, body);
      },
    };
    const ref = {
      game: {
        chainId: 31337,
        world: "0xbe09885633Df7DfEfB96517cd6547fd4516A2907",
        season: 1,
      },
      wallet: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    };
    expect(await ensureWalletFolder(writer, ref)).toBe("created");
    expect(await ensureWalletFolder(writer, ref)).toBe("reused");
    expect(written.size).toBe(2);
    expect(
      written.get(
        "31337-0xbe09885633df7dfefb96517cd6547fd4516a2907-1/0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266/game.json",
      ),
    ).toContain('"season":1');
  });
});
