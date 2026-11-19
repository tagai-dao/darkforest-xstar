import { parseGameFile } from "./GameSave";

export type FolderCard = {
  folderName: string;
  address?: string;
  chainId?: number;
  homeX?: number;
  homeY?: number;
  priceText?: string;
};

type FolderCardFiles = {
  agent?: string;
  game?: string;
  homes?: string;
  price?: string;
};

function readAddress(text: string | undefined): string | undefined {
  if (!text) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(text) as { address?: unknown };
    if (
      typeof parsed.address === "string" &&
      /^0x[0-9a-fA-F]{40}$/.test(parsed.address)
    ) {
      return parsed.address.toLowerCase();
    }
  } catch {
    // 半截文件不当成钱包。
  }
  return undefined;
}

function readHome(
  text: string | undefined,
): { x: number; y: number } | undefined {
  if (!text) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(text) as {
      coords?: { x?: unknown; y?: unknown };
    }[];
    const coords = parsed[0]?.coords;
    if (typeof coords?.x === "number" && typeof coords.y === "number") {
      return { x: coords.x, y: coords.y };
    }
  } catch {
    // 家坐标还没写完。
  }
  return undefined;
}

/** 只看钱包目录里的几份小文件，不把整张星图读进首页。 */
export function folderCardFromFiles(
  folderName: string,
  files: FolderCardFiles,
): FolderCard {
  const card: FolderCard = { folderName };
  card.address = readAddress(files.agent);
  if (files.game) {
    try {
      const game = parseGameFile(files.game);
      card.chainId = game.chainId;
    } catch {
      // 游戏文件对不上时，首页仍显示目录名。
    }
  }
  const home = readHome(files.homes);
  if (home) {
    card.homeX = home.x;
    card.homeY = home.y;
  }
  if (files.price) {
    card.priceText = files.price;
  }
  return card;
}

async function readText(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<string | undefined> {
  try {
    const handle = await dir.getFileHandle(name);
    return (await handle.getFile()).text();
  } catch {
    return undefined;
  }
}

export async function readFolderCard(
  dir: FileSystemDirectoryHandle,
): Promise<FolderCard> {
  const [agent, game, homes, price] = await Promise.all([
    readText(dir, "agent.json"),
    readText(dir, "game.json"),
    readText(dir, "homeLocations.json"),
    readText(dir, "price.json"),
  ]);
  return folderCardFromFiles(dir.name, { agent, game, homes, price });
}
