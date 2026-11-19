export interface ArrivalCue {
  id: string;
  player: string;
  arrivalTick: number;
}

export interface ArrivalMemory {
  // 这一局里还在飞、并且是自己的舰队。
  flying: Set<string>;
  // 已经处理过落地的舰队，避免每一拍都再响一次。
  heard: Set<string>;
}

/**
 * 自己的舰队从“还在飞”变成“到达时刻已过”时返回 true。
 * 打开页面时已经落地的舰队只记下来，不响。攻击和支援都算。
 */
export function noteMyArrivals(
  voyages: ArrivalCue[],
  account: string | undefined,
  nowTick: number,
  memory: ArrivalMemory,
): boolean {
  if (!account) return false;
  const me = account.toLowerCase();
  const live = new Set<string>();
  let landed = false;

  for (const voyage of voyages) {
    if (voyage.player.toLowerCase() !== me) continue;
    live.add(voyage.id);
    if (memory.heard.has(voyage.id)) continue;

    if (nowTick < voyage.arrivalTick) {
      memory.flying.add(voyage.id);
      continue;
    }

    if (memory.flying.has(voyage.id)) landed = true;
    memory.flying.delete(voyage.id);
    memory.heard.add(voyage.id);
  }

  for (const id of memory.flying) {
    if (!live.has(id)) memory.flying.delete(id);
  }
  for (const id of memory.heard) {
    if (!live.has(id)) memory.heard.delete(id);
  }

  return landed;
}
