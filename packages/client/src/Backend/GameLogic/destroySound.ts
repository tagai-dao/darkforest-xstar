/**
 * 判断一颗星球这次更新是不是“刚被摧毁”：之前见过、没有摧毁，现在摧毁了。
 *
 * 第一次见到的星球（打开页面时加载的）不算，否则刷新页面会把所有已毁的星球都响一遍。
 * @param wasDestroyed 更新之前的摧毁状态；没见过这颗星球时为 undefined
 * @param isDestroyed 更新之后的摧毁状态
 */
export function isNewlyDestroyed(
  wasDestroyed: boolean | undefined,
  isDestroyed: boolean | undefined,
): boolean {
  return wasDestroyed === false && isDestroyed === true;
}
