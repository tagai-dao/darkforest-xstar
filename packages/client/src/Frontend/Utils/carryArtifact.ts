import type { LocationId } from "@df/types";

/**
 * 选中的星球变了，要清掉哪颗星球上“已选中的运送神器”。
 *
 * 只有真正离开了某颗星球，才清它上面的神器。
 * 重新选中同一颗星球时不能清：点“运送”会先记下神器、再居中到这颗星球，
 * 居中会再选中一次同一颗星球，如果这时把它当成“离开”，刚记下的神器会被立刻清掉，
 * 结果就是按钮不亮、出发命令里也不带神器。
 *
 * @param previousId 变化之前选中的星球
 * @param nextId 变化之后选中的星球，取消选中时为 undefined
 * @returns 需要清掉神器的星球；没有则返回 undefined
 */
export function planetToClearCarry(
  previousId: LocationId | undefined,
  nextId: LocationId | undefined,
): LocationId | undefined {
  if (!previousId || previousId === nextId) return undefined;
  return previousId;
}
