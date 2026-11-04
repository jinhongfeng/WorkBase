export const GROUP_ORDER = ['记录', '外部数据', '工具'] as const
export function compareGroups(a: string, b: string): number {
  const rank = (group: string): number => { const index = (GROUP_ORDER as readonly string[]).indexOf(group); return index < 0 ? GROUP_ORDER.length : index }
  return rank(a) - rank(b)
}
