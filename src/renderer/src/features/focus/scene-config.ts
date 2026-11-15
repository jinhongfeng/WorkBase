import { BookOpen, Film, Images, Languages, NotebookText, Wind, type LucideIcon } from 'lucide-react'

/** 沉浸控制面板中的可选场景。 */
export type SceneId = 'study' | 'study-notes' | 'study-english' | 'video' | 'image' | 'relax'

export interface SceneOption {
  id: SceneId
  label: string
  hint: string
  icon: LucideIcon
  group: '学习' | '媒体' | '放松'
}

export const SCENE_OPTIONS: SceneOption[] = [
  { id: 'study', label: '学习', hint: '提供阅读笔记和学习英语入口', icon: BookOpen, group: '学习' },
  { id: 'study-notes', label: '阅读笔记', hint: '直接进入笔记选择与阅读', icon: NotebookText, group: '学习' },
  { id: 'study-english', label: '学习英语', hint: '直接进入英语学习包复习', icon: Languages, group: '学习' },
  { id: 'video', label: '视频', hint: '从媒体库播放视频，播完自动下一条', icon: Film, group: '媒体' },
  { id: 'image', label: '图片', hint: '从媒体库看图，5 秒自动下一张', icon: Images, group: '媒体' },
  { id: 'relax', label: '放松', hint: '呼吸练习、正念冥想与护眼休息', icon: Wind, group: '放松' }
]

export const SCENE_SETTING = 'ui.immersive_scenes'

/** 默认显示学习、阅读笔记、视频、图片和放松。 */
export const DEFAULT_SCENES: SceneId[] = ['study', 'study-notes', 'video', 'image', 'relax']

const SCENE_IDS = new Set<string>(SCENE_OPTIONS.map(option => option.id))

export function sceneOption(id: SceneId): SceneOption {
  return SCENE_OPTIONS.find(option => option.id === id) as SceneOption
}

/** 丢弃已保存的非法项，结果为空时回退默认清单。 */
export function parseSceneSettings(raw?: string): SceneId[] {
  if (!raw) return DEFAULT_SCENES
  try {
    const saved = JSON.parse(raw) as { items?: unknown } | null
    const items = Array.isArray(saved?.items) ? saved.items : []
    const picked: SceneId[] = []
    for (const item of items) {
      if (typeof item === 'string' && SCENE_IDS.has(item) && !picked.includes(item as SceneId)) picked.push(item as SceneId)
    }
    return picked.length ? picked : DEFAULT_SCENES
  } catch {
    return DEFAULT_SCENES
  }
}

export function serializeScenes(items: SceneId[]): string {
  return JSON.stringify({ items })
}
