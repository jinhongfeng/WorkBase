import type { SkillSource } from '@shared/types'

export const SOURCE_LABEL: Record<SkillSource, string> = {
  manual: '自建',
  import_zip: '导入 ZIP',
  import_dir: '导入目录',
  import_md: '导入文件',
  duplicate: '副本'
}

export const COVER_LABEL: Record<'none' | 'image' | 'video', string> = {
  none: '无封面',
  image: '图片封面',
  video: '视频封面'
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export function splitTags(value: string): string[] {
  return [...new Set(value.split(/[,，\s]+/).map(tag => tag.trim()).filter(Boolean))].slice(0, 12)
}
