import {
  serializeGameFile,
  serializeGameSave,
  walletFolderName,
  type WalletSaveRef,
} from "../Backend/Save/GameSave";

export type FolderWriter = {
  exists(path: string): Promise<boolean>;
  writeNew(path: string, body: string): Promise<void>;
};

export async function ensureWalletFolder(
  writer: FolderWriter,
  ref: WalletSaveRef,
): Promise<"created" | "reused"> {
  const agentPath = `${walletFolderName(ref)}/agent.json`;
  const gamePath = `${walletFolderName(ref)}/game.json`;
  if (await writer.exists(agentPath)) {
    if (!(await writer.exists(gamePath))) {
      await writer.writeNew(gamePath, serializeGameFile(ref.game));
    }
    return "reused";
  }
  const files = serializeGameSave({
    agent: { address: ref.wallet },
    chunks: [],
    homeLocations: [],
    pendingTxs: [],
  });
  await writer.writeNew(agentPath, files.get("agent.json") ?? "");
  await writer.writeNew(gamePath, serializeGameFile(ref.game));
  return "created";
}
