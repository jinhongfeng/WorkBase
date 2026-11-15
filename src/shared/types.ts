import type { VaultAccount, VaultAccountInput, VaultStatus } from './vault'
import type { EnglishArticle, EnglishArticleSummary, EnglishArticleTopic } from './english-articles'
import type { DailyBriefStatus } from './daily-briefs'
import type { InstalledPlugin } from './plugins'
import type { ArticleCategory, ArticleDraft, ArticleGenerateInput } from './article-writing'
import type { AnalyzeReferencesInput, CreateReferenceContentInput, RankingQuery, ReferenceAnalysis, ReferenceContent, ReferenceRanking } from './article-references'

export interface AppPaths {
  userData: string
  dataDirectory: string
  database: string
  files: string
}

/** 数据目录信息，供设置页展示与迁移。 */
export interface StorageInfo {
  directory: string
  database: string
  files: string
  defaultDirectory: string
  isDefault: boolean
}

export type Settings = Record<string, string>

export type NoteKind = 'note' | 'journal'

export type FolderLibrary = 'notes' | 'skills'

export interface LibraryFolder {
  id: string
  name: string
}

export interface LibraryFolderInput {
  id?: string
  name: string
}

export interface Note {
  id: string
  title: string
  content: string
  tags: string
  pinned: number
  archived: number
  kind: NoteKind
  journalDate: string | null
  createdAt: number
  updatedAt: number
}

export interface NoteSummary {
  id: string
  folderId: string | null
  title: string
  excerpt: string
  tags: string
  pinned: number
  kind: NoteKind
  journalDate: string | null
  createdAt: number
  updatedAt: number
  words: number
}

export interface NoteQuery {
  query?: string
  kind?: NoteKind | 'all'
  pinnedOnly?: boolean
  limit?: number
  offset?: number
}

export interface NotePage {
  items: NoteSummary[]
  total: number
  offset: number
}

export interface NoteSaveInput {
  id?: string
  title: string
  content: string
  tags: string[]
  kind: NoteKind
  journalDate?: string | null
}

export interface NoteStats {
  total: number
  journals: number
  words: number
  todayWords: number
  writingDays: { date: string; words: number }[]
  journalDays: string[]
}

export interface Todo {
  id: string
  title: string
  detail: string
  priority: number
  dueDate: string | null
  done: number
  doneAt: number | null
  createdAt: number
  updatedAt: number
  sort: number
}

export interface TodoInput {
  id?: string
  title: string
  detail?: string
  priority?: number
  dueDate?: string | null
}

export interface TodoStats {
  pending: number
  overdue: number
  dueToday: number
}

export type IeltsItemKind = 'word' | 'sentence'

export interface IeltsSet {
  id: string
  title: string
  topic: string
  level: string
  createdAt: number
  itemCount: number
  mastered: number
  hasReading: boolean
}

export interface IeltsReading {
  passage: string
  summary: string
  sentences: {
    original: string
    structure: string[]
    translation: string
    imitation: string
    imitationTranslation: string
  }[]
  substitutions: { original: string; replacement: string }[]
  patterns: string[]
}

export interface IeltsItem {
  id: string
  setId: string
  kind: IeltsItemKind
  term: string
  phonetic: string
  pos: string
  meaning: string
  example: string
  translation: string
  collocation: string
  wordFamily: string
  band: string
  mastery: number
  wrong: number
  reviewAt: number
  createdAt: number
}

export type IeltsGenerateInput = {
  topic: string
  level: string
} & (
  | { kind: IeltsItemKind | 'mixed'; count: number }
  | { kind: 'reading'; passage?: string }
)

export interface IeltsGenerateResult {
  set: IeltsSet
  items: IeltsItem[]
}

export interface IeltsStats {
  total: number
  mastered: number
  due: number
  streak: number
  todayReviewed: number
}

export interface Habit {
  id: string
  name: string
  icon: string
  color: string
  target: number
  sort: number
  createdAt: number
}

export interface HabitWithLogs extends Habit {
  logs: Record<string, number>
  streak: number
  doneToday: number
}

export interface HabitInput {
  name: string
  icon?: string
  color?: string
  target?: number
}

export interface FocusDay {
  date: string
  minutes: number
}

export type ActivitySource = 'notes' | 'ielts' | 'todos' | 'habits'
export interface ActivityDay {
  date: string
  noteWords: number
  ieltsMilliseconds: number
  ieltsReviews: number
  todosCompleted: number
  habitCheckins: number
}
export interface ActivityYear {
  year: number
  trackingSince: string
  sources: ActivitySource[]
  days: ActivityDay[]
}

export interface FocusStats {
  todayMinutes: number
  weekMinutes: number
  totalSessions: number
  days: FocusDay[]
  /** 近 365 天逐日专注分钟，与 days(7 天) 互相独立。 */
  year: FocusDay[]
  /** 最近几轮专注记录（最多 5 条），供专注页「最近专注」展示。 */
  recent: FocusSession[]
}

export interface FocusSession {
  id: string
  minutes: number
  label: string
  startedAt: number
}

export interface AIConfig {
  baseUrl: string
  model: string
  hasKey: boolean
  configured: boolean
  temperature: number
  maxTokens: number
}

export interface AIConfigInput {
  baseUrl: string
  model: string
  temperature: number
  maxTokens: number
  apiKey?: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  requestId: string
  threadId: string
  messages: ChatMessage[]
  temperature?: number
}

export interface ChatResult {
  content: string
}

export interface AIThread {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

export interface AIMessage extends ChatMessage {
  id: string
  threadId: string
  createdAt: number
}

export interface BackupResult {
  path: string
  size: number
}

export type SkillLayout = 'dir' | 'file'
export type SkillSource = 'manual' | 'import_zip' | 'import_dir' | 'import_md' | 'duplicate'
export type SkillCoverKind = 'none' | 'image' | 'video'

export interface SkillSummary {
  id: string
  folderId: string | null
  name: string
  description: string
  tags: string[]
  source: SkillSource
  sourceRef: string
  layout: SkillLayout
  coverKind: SkillCoverKind
  coverUrl: string | null
  pinned: number
  fileCount: number
  createdAt: number
  updatedAt: number
}

export interface SkillFileEntry {
  path: string
  size: number
}

export interface SkillDetail extends SkillSummary {
  slug: string
  content: string
  files: SkillFileEntry[]
}

export interface SkillInput {
  id?: string
  name: string
  description: string
  content: string
  tags: string[]
}

export interface SkillQuery {
  q?: string
  source?: SkillSource | 'all'
  tag?: string
}

export interface SkillImportResult {
  canceled: boolean
  skill: SkillSummary | null
}

export type WallpaperSource = 'url' | 'file' | 'system' | 'engine'
export type WallpaperScope = 'workspace' | 'immersive'
export type ImmersiveWallpaperMode = 'solid' | 'workspace' | 'custom'
export const WALLPAPER_FITS = ['cover', 'fill-window', 'scale-down'] as const
export interface WallpaperItem {
  kind?: 'image' | 'video'
  engineId?: string
  id: string
  source: WallpaperSource
  label: string
  url: string
  dark: boolean
}
/** animated 表示选中后壁纸层是否真的会动：视频项目播放视频，动图预览播放帧动画，静态封面不会动。 */
export interface WallpaperEngineItem { id: string; title: string; previewUrl: string; type: string; kind: 'image' | 'video'; animated: boolean }
export interface WallpaperEngineLibrary { items: WallpaperEngineItem[]; directories: string[]; skipped: number; truncated: boolean }
export interface WallpaperConfig {
  items: WallpaperItem[]
  activeId: string | null
  carousel: boolean
  interval: number
  overlay: number
  fit?: typeof WALLPAPER_FITS[number]
  mode?: ImmersiveWallpaperMode
  clear?: boolean
}
export type WallpaperUpdate = Partial<Pick<WallpaperConfig, 'carousel' | 'interval' | 'overlay' | 'fit' | 'mode' | 'clear'>>

export type MediaType = 'image' | 'video'
export type MediaSource = 'local' | 'url'
export interface MediaGroup {
  id: string
  name: string
  description: string
  coverUrl: string | null
}
export interface MediaGroupInput { id?: string; name: string; description: string }
export interface MediaItem {
  id: string
  type: MediaType
  source: MediaSource
  name: string
  fileName: string
  originalName: string
  originalUrl: string
  mime: string
  size: number
  url: string
  createdAt: number
  groupId: string | null
}
export interface MediaQuery { type?: 'all' | MediaType; q?: string; page?: number; pageSize?: number; groupId?: string | null }
export interface MediaListResult { items: MediaItem[]; total: number }
/** 导入时被去重跳过的素材，existing 指向媒体库中已有的那条记录。 */
export interface MediaDuplicate {
  name: string
  existingName: string
  groupId: string | null
  groupName: string | null
}
export interface MediaImportResult { items: MediaItem[]; duplicates: MediaDuplicate[] }
export interface MediaAPI {
  list(query: MediaQuery): Promise<MediaListResult>
  listGroups(): Promise<MediaGroup[]>
  saveGroup(input: MediaGroupInput): Promise<MediaGroup>
  removeGroup(id: string): Promise<void>
  moveToGroup(id: string, groupId: string | null): Promise<void>
  saveLocalFiles(groupId?: string): Promise<MediaImportResult>
  saveLocalPaths(paths: string[], groupId?: string): Promise<MediaImportResult>
  saveBuffers(inputs: { name: string; data: ArrayBuffer }[], groupId?: string): Promise<MediaImportResult>
  saveFromUrl(input: { url: string; groupId?: string }): Promise<MediaImportResult>
  remove(id: string): Promise<void>
  reveal(id: string): Promise<void>
  openExternal(id: string): Promise<void>
}

export interface WorkBaseAPI {
  plugins: {
    list(): Promise<InstalledPlugin[]>
    onChanged(callback: () => void): () => void
    openDirectory(): Promise<void>
  }
  vault: {
    status(): Promise<VaultStatus>
    open(passphrase: string, create: boolean): Promise<void>
    lock(): Promise<void>
    list(): Promise<VaultAccount[]>
    save(input: VaultAccountInput): Promise<void>
    remove(id: string): Promise<void>
    connectBrowser(): Promise<void>
    disconnectBrowser(): Promise<void>
  }
  memories: {
    list(page: number, year?: string | null, query?: string | null): Promise<import('./memories').MemoryPage>
    save(input: import('./memories').MemoryInput): Promise<import('./memories').MemoryEntry>
    remove(id: string): Promise<void>
  }
  media: MediaAPI
  wallpaper: {
    get(scope?: WallpaperScope): Promise<WallpaperConfig>
    addUrl(input: { url: string; label?: string }, scope?: WallpaperScope): Promise<WallpaperConfig>
    addFile(scope?: WallpaperScope): Promise<WallpaperConfig | null>
    addSystem(scope?: WallpaperScope): Promise<WallpaperConfig>
    listEngine(): Promise<WallpaperEngineLibrary>
    chooseEngineDirectory(): Promise<WallpaperEngineLibrary | null>
    addEngine(id: string, scope?: WallpaperScope): Promise<WallpaperConfig>
    remove(id: string, scope?: WallpaperScope): Promise<WallpaperConfig>
    setActive(id: string | null, scope?: WallpaperScope): Promise<WallpaperConfig>
    updateConfig(input: WallpaperUpdate, scope?: WallpaperScope): Promise<WallpaperConfig>
    clear(scope?: WallpaperScope): Promise<WallpaperConfig>
  }
  bills: import('./bills').BillsAPI
  app: {
    getPaths(): Promise<AppPaths>
    getVersion(): Promise<string>
    setWindowTheme(theme: 'light' | 'dark'): Promise<void>
    setWallpaperContrast(dark: boolean): Promise<void>
    relaunch(): Promise<void>
    onBeforeClose(save: () => Promise<boolean>): () => void
    getFilePath(file: File): string
    getLoginItem(): Promise<boolean>
    setLoginItem(enabled: boolean): Promise<boolean>
  }
  settings: {
    getAll(): Promise<Settings>
    set(key: string, value: string): Promise<void>
    setPinnedModules(ids: string[]): Promise<void>
  }
  notes: {
    listPage(query: NoteQuery): Promise<NotePage>
    list(query: NoteQuery): Promise<NoteSummary[]>
    get(id: string): Promise<Note | null>
    getJournal(date: string): Promise<Note | null>
    save(input: NoteSaveInput): Promise<Note>
    remove(id: string): Promise<void>
    togglePin(id: string): Promise<void>
    stats(): Promise<NoteStats>
    trash(): Promise<NoteSummary[]>
    archive(id: string): Promise<void>
    restore(id: string): Promise<void>
  }
  libraryFolders: {
    list(library: FolderLibrary): Promise<LibraryFolder[]>
    save(library: FolderLibrary, input: LibraryFolderInput): Promise<LibraryFolder>
    moveItem(library: FolderLibrary, itemId: string, folderId: string | null): Promise<void>
    remove(library: FolderLibrary, id: string): Promise<void>
  }
  todos: {
    list(): Promise<Todo[]>
    stats(): Promise<TodoStats>
    save(input: TodoInput): Promise<Todo>
    toggle(id: string): Promise<Todo>
    remove(id: string): Promise<void>
    clearDone(): Promise<void>
  }
  ielts: {
    studyPulse(input: { sessionId: string; active: boolean }): Promise<void>
    sets(): Promise<IeltsSet[]>
    reading(setId: string): Promise<IeltsReading | null>
    items(setId?: string): Promise<IeltsItem[]>
    generate(input: IeltsGenerateInput): Promise<IeltsGenerateResult>
    review(input: { id: string; known: boolean }): Promise<IeltsItem>
    removeSet(id: string): Promise<void>
    stats(): Promise<IeltsStats>
  }
  dailyBriefs: {
    list(): Promise<DailyBriefStatus>
    refresh(): Promise<void>
    remove(date: string): Promise<void>
    onChanged(callback: () => void): () => void
  }
  englishArticles: {
    discover(topic: EnglishArticleTopic): Promise<EnglishArticleSummary[]>
    fetch(url: string): Promise<EnglishArticle>
    list(): Promise<EnglishArticleSummary[]>
    get(id: string): Promise<EnglishArticle | null>
    save(article: EnglishArticle): Promise<void>
    refreshImages(id: string): Promise<EnglishArticle>
    remove(id: string): Promise<void>
  }
  habits: {
    list(): Promise<HabitWithLogs[]>
    create(input: HabitInput): Promise<HabitWithLogs[]>
    remove(id: string): Promise<void>
    toggle(input: { id: string; date: string }): Promise<HabitWithLogs[]>
    setCount(input: { id: string; date: string; count: number }): Promise<HabitWithLogs[]>
  }
  focus: {
    add(input: { minutes: number; label?: string }): Promise<FocusStats>
    stats(): Promise<FocusStats>
  }
  activity: {
    year(input: { year: number; sources: ActivitySource[] }): Promise<ActivityYear>
  }
  ai: {
    config(): Promise<AIConfig>
    saveConfig(input: AIConfigInput): Promise<AIConfig>
    test(): Promise<string>
    generateArticle(input: ArticleGenerateInput): Promise<ArticleDraft>
    chat(input: ChatRequest): Promise<ChatResult>
    regenerate(input: { requestId: string; threadId: string }): Promise<ChatResult>
    abort(requestId: string): Promise<void>
    threads: {
      list(): Promise<AIThread[]>
      create(): Promise<AIThread>
      messages(threadId: string): Promise<AIMessage[]>
      rename(id: string, title: string): Promise<void>
      remove(id: string): Promise<void>
    }
    onDelta(listener: (requestId: string, text: string) => void): () => void
  }
  articleReferences: {
    discover(query: RankingQuery | ArticleCategory): Promise<ReferenceRanking>
    analyze(input: AnalyzeReferencesInput): Promise<ReferenceAnalysis>
    create(input: CreateReferenceContentInput): Promise<ReferenceContent>
  }
  assets: {
    saveImage(dataUrl: string): Promise<{ url: string }>
  }
  data: {
    export(): Promise<BackupResult | null>
    reveal(): Promise<void>
    storage(): Promise<StorageInfo>
    chooseDirectory(): Promise<string | null>
    relocateDefault(): Promise<string>
  }
  skills: {
    list(query: SkillQuery): Promise<SkillSummary[]>
    get(id: string): Promise<SkillDetail | null>
    save(input: SkillInput): Promise<SkillDetail>
    create(input?: { fromId?: string }): Promise<SkillDetail>
    remove(id: string): Promise<void>
    togglePin(id: string): Promise<void>
    importZip(): Promise<SkillImportResult>
    importDirectory(): Promise<SkillImportResult>
    importMarkdown(): Promise<SkillImportResult>
    importPath(path: string): Promise<SkillImportResult>
    chooseCover(id: string, kind: 'image' | 'video'): Promise<SkillDetail | null>
    setCoverUrl(id: string, input: { url: string; kind: 'image' | 'video' }): Promise<SkillDetail>
    clearCover(id: string): Promise<SkillDetail>
    reveal(id: string): Promise<void>
  }
}
