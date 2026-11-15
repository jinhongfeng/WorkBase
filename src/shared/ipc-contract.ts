import type {
  AIConfig, AIConfigInput, AppPaths, ChatRequest, ChatResult, ClipboardItem, ClipboardPage, ClipboardQuery,
  FocusStats, HabitInput, HabitWithLogs,
  IeltsGenerateInput, IeltsGenerateResult, IeltsItem, IeltsReading, IeltsSet, IeltsStats, Note, NotePage, NoteQuery, NoteSaveInput,
  NoteStats, NoteSummary, Settings, SkillDetail, SkillImportResult, SkillInput, SkillQuery, SkillSummary,
  StorageInfo, Todo, TodoInput, TodoStats, ActivitySource, ActivityYear, PageTimeStats, WallpaperConfig, WallpaperEngineLibrary, WallpaperScope, WallpaperUpdate,
  MediaQuery, MediaListResult, MediaGroup, MediaGroupInput, MediaImportResult, AIThread, AIMessage, BackupResult,
  FolderLibrary, LibraryFolder, LibraryFolderInput
} from './types'

import type { BillAccount, BillBudgetOverview, BillFileSelection, BillImportResult, BillOverview, BillRange, BillRowsPage, BillRule } from './bills'
import type { MemoryEntry, MemoryInput, MemoryPage } from './memories'
import type { VaultAccount, VaultAccountInput, VaultStatus } from './vault'
import type { EnglishArticle, EnglishArticleSummary, EnglishArticleTopic } from './english-articles'
import type { DailyBriefStatus } from './daily-briefs'
import type { InstalledPlugin } from './plugins'
import type { ArticleCategory, ArticleDraft, ArticleGenerateInput } from './article-writing'
import type { AnalyzeReferencesInput, CreateReferenceContentInput, RankingQuery, ReferenceAnalysis, ReferenceContent, ReferenceRanking } from './article-references'
import type { ShelfInput, ShelfItem, ShelfQuery, ShelfStats } from './shelf'
import type { Source, SourceEntryPage, SourceRefreshResult } from './sources'

export const channels = {
  pluginsList: 'plugins:list', pluginsChanged: 'plugins:changed', pluginsOpenDirectory: 'plugins:openDirectory',
  vaultStatus: 'vault:status', vaultOpen: 'vault:open', vaultLock: 'vault:lock',
  vaultList: 'vault:list', vaultSave: 'vault:save', vaultRemove: 'vault:remove',
  vaultConnect: 'vault:connectBrowser', vaultDisconnect: 'vault:disconnectBrowser',
  mediaList: 'media:list', mediaSaveLocal: 'media:saveLocalFiles', mediaSaveLocalPaths: 'media:saveLocalPaths',
  mediaSaveBuffers: 'media:saveBuffers',
  mediaSaveUrl: 'media:saveFromUrl',
  mediaRemove: 'media:remove', mediaReveal: 'media:reveal', mediaOpenExternal: 'media:openExternal',
  mediaListGroups: 'media:listGroups', mediaSaveGroup: 'media:saveGroup',
  mediaRemoveGroup: 'media:removeGroup', mediaMoveToGroup: 'media:moveToGroup',
  wallpaperGet: 'wallpaper:get', wallpaperAddUrl: 'wallpaper:addUrl',
  wallpaperAddFile: 'wallpaper:addFile', wallpaperAddSystem: 'wallpaper:addSystem',
  wallpaperEngineList: 'wallpaper:engineList', wallpaperEngineChooseDirectory: 'wallpaper:engineChooseDirectory', wallpaperAddEngine: 'wallpaper:addEngine',
  wallpaperRemove: 'wallpaper:remove', wallpaperSetActive: 'wallpaper:setActive',
  wallpaperUpdateConfig: 'wallpaper:updateConfig', wallpaperClear: 'wallpaper:clear',
  appSetWallpaperContrast: 'app:setWallpaperContrast',
  activityYear: 'activity:year', ieltsStudyPulse: 'ielts:studyPulse',
  pageTimeTrack: 'pageTime:track', pageTimeStats: 'pageTime:stats',
  billAccount: 'bills:account', billSaveAccount: 'bills:saveAccount',
  billImportFile: 'bills:importFile', billFetchMail: 'bills:fetchFromMail', billOverview: 'bills:overview',
  billUnlockFile: 'bills:unlockFile', billCancelFileImport: 'bills:cancelFileImport', billRows: 'bills:rows',
  billBudget: 'bills:budget', billSetBudget: 'bills:setBudget',
  billRules: 'bills:rules', billSaveRule: 'bills:saveRule', billRemoveRule: 'bills:removeRule', billApplyRules: 'bills:applyRules',
  getPaths: 'app:getPaths', getVersion: 'app:getVersion', appRelaunch: 'app:relaunch',
  appCloseReady: 'app:closeReady', appFlushNotes: 'app:flushNotes', appFlushNotesResult: 'app:flushNotesResult',
  setWindowTheme: 'app:setWindowTheme',
  appGetLoginItem: 'app:getLoginItem', appSetLoginItem: 'app:setLoginItem',
  quickCaptureHide: 'quick-capture:hide',
  getAll: 'settings:getAll', set: 'settings:set', setPinnedModules: 'settings:setPinnedModules',
  notesList: 'notes:list', notesListPage: 'notes:listPage', notesGet: 'notes:get', notesGetJournal: 'notes:getJournal', notesSave: 'notes:save',
  notesRemove: 'notes:remove', notesPin: 'notes:togglePin', notesStats: 'notes:stats',
  notesTrash: 'notes:trash', notesArchive: 'notes:archive', notesRestore: 'notes:restore', notesExport: 'notes:export',
  notesWikiTarget: 'notes:wikiTarget', notesBacklinks: 'notes:backlinks',
  libraryFoldersList: 'libraryFolders:list', libraryFoldersSave: 'libraryFolders:save',
  libraryFoldersMove: 'libraryFolders:moveItem', libraryFoldersRemove: 'libraryFolders:remove',
  memoriesList: 'memories:list', memoriesSave: 'memories:save', memoriesRemove: 'memories:remove',
  shelfList: 'shelf:list', shelfStats: 'shelf:stats', shelfSave: 'shelf:save', shelfRemove: 'shelf:remove',
  sourcesList: 'sources:list', sourcesEntries: 'sources:entries', sourcesAdd: 'sources:add',
  sourcesUpdate: 'sources:update', sourcesRemove: 'sources:remove', sourcesRefresh: 'sources:refresh',
  sourcesSetRead: 'sources:setRead', sourcesReadEntry: 'sources:readEntry', sourcesOpenEntry: 'sources:openEntry',
  todosList: 'todos:list', todosStats: 'todos:stats', todosSave: 'todos:save', todosToggle: 'todos:toggle',
  todosRemove: 'todos:remove', todosClearDone: 'todos:clearDone', todosReorder: 'todos:reorder',
  clipboardList: 'clipboard:list', clipboardCopy: 'clipboard:copy', clipboardPin: 'clipboard:togglePin',
  clipboardRemove: 'clipboard:remove', clipboardClear: 'clipboard:clear', clipboardSetEnabled: 'clipboard:setEnabled',
  ieltsSets: 'ielts:sets', ieltsItems: 'ielts:items', ieltsGenerate: 'ielts:generate',
  ieltsReading: 'ielts:reading',
  ieltsReview: 'ielts:review', ieltsRemoveSet: 'ielts:removeSet', ieltsStats: 'ielts:stats',
  englishArticlesDiscover: 'englishArticles:discover', englishArticlesFetch: 'englishArticles:fetch',
  englishArticlesList: 'englishArticles:list', englishArticlesGet: 'englishArticles:get',
  englishArticlesSave: 'englishArticles:save', englishArticlesRemove: 'englishArticles:remove',
  englishArticlesRefreshImages: 'englishArticles:refreshImages',
  dailyBriefsList: 'dailyBriefs:list', dailyBriefsRefresh: 'dailyBriefs:refresh',
  dailyBriefsRemove: 'dailyBriefs:remove', dailyBriefsChanged: 'dailyBriefs:changed',
  habitsList: 'habits:list', habitsCreate: 'habits:create', habitsRemove: 'habits:remove', habitsToggle: 'habits:toggle',
  habitsSetCount: 'habits:setCount',
  focusAdd: 'focus:add', focusStats: 'focus:stats', focusRename: 'focus:rename', focusRemove: 'focus:remove',
  aiConfig: 'ai:config', aiSaveConfig: 'ai:saveConfig', aiTest: 'ai:test', aiChat: 'ai:chat', aiDelta: 'ai:delta',
  aiGenerateArticle: 'ai:generateArticle', aiDailyReport: 'ai:dailyReport',
  articleReferencesDiscover: 'articleReferences:discover', articleReferencesAnalyze: 'articleReferences:analyze', articleReferencesCreate: 'articleReferences:create',
  aiAbort: 'ai:abort', aiRegenerate: 'ai:regenerate', aiThreadsList: 'ai:threads:list', aiThreadsCreate: 'ai:threads:create',
  aiThreadsMessages: 'ai:threads:messages', aiThreadsRename: 'ai:threads:rename', aiThreadsRemove: 'ai:threads:remove',
  assetsSaveImage: 'assets:saveImage',
  skillsList: 'skills:list', skillsGet: 'skills:get', skillsSave: 'skills:save',
  skillsCreate: 'skills:create', skillsRemove: 'skills:remove', skillsPin: 'skills:togglePin',
  skillsImportZip: 'skills:importZip', skillsImportDir: 'skills:importDirectory', skillsImportMd: 'skills:importMarkdown',
  skillsImportPath: 'skills:importPath',
  skillsChooseCover: 'skills:chooseCover', skillsSetCoverUrl: 'skills:setCoverUrl', skillsClearCover: 'skills:clearCover',
  skillsReveal: 'skills:reveal',
  dataExport: 'data:export', dataReveal: 'data:reveal',
  dataStorage: 'data:storage', dataChooseDirectory: 'data:chooseDirectory', dataRelocateDefault: 'data:relocateDefault'
} as const

export interface IPCContract {
  'plugins:list': { args: []; result: InstalledPlugin[] }
  'plugins:openDirectory': { args: []; result: void }
  'vault:status': { args: []; result: VaultStatus }
  'vault:open': { args: [passphrase: string, create: boolean]; result: void }
  'vault:lock': { args: []; result: void }
  'vault:list': { args: []; result: VaultAccount[] }
  'vault:save': { args: [input: VaultAccountInput]; result: void }
  'vault:remove': { args: [id: string]; result: void }
  'vault:connectBrowser': { args: []; result: void }
  'vault:disconnectBrowser': { args: []; result: void }
  'media:list': { args: [query: MediaQuery]; result: MediaListResult }
  'media:listGroups': { args: []; result: MediaGroup[] }
  'media:saveGroup': { args: [input: MediaGroupInput]; result: MediaGroup }
  'media:removeGroup': { args: [id: string]; result: void }
  'media:moveToGroup': { args: [id: string, groupId: string | null]; result: void }
  'media:saveLocalFiles': { args: [groupId?: string]; result: MediaImportResult }
  'media:saveLocalPaths': { args: [paths: string[], groupId?: string]; result: MediaImportResult }
  'media:saveBuffers': { args: [inputs: { name: string; data: ArrayBuffer }[], groupId?: string]; result: MediaImportResult }
  'media:saveFromUrl': { args: [input: { url: string; groupId?: string }]; result: MediaImportResult }
  'media:remove': { args: [id: string]; result: void }
  'media:reveal': { args: [id: string]; result: void }
  'media:openExternal': { args: [id: string]; result: void }
  'wallpaper:get': { args: [scope?: WallpaperScope]; result: WallpaperConfig }
  'wallpaper:addUrl': { args: [input: { url: string; label?: string }, scope?: WallpaperScope]; result: WallpaperConfig }
  'wallpaper:addFile': { args: [scope?: WallpaperScope]; result: WallpaperConfig | null }
  'wallpaper:addSystem': { args: [scope?: WallpaperScope]; result: WallpaperConfig }
  'wallpaper:engineList': { args: []; result: WallpaperEngineLibrary }
  'wallpaper:engineChooseDirectory': { args: []; result: WallpaperEngineLibrary | null }
  'wallpaper:addEngine': { args: [id: string, scope?: WallpaperScope]; result: WallpaperConfig }
  'wallpaper:remove': { args: [id: string, scope?: WallpaperScope]; result: WallpaperConfig }
  'wallpaper:setActive': { args: [id: string | null, scope?: WallpaperScope]; result: WallpaperConfig }
  'wallpaper:updateConfig': { args: [input: WallpaperUpdate, scope?: WallpaperScope]; result: WallpaperConfig }
  'wallpaper:clear': { args: [scope?: WallpaperScope]; result: WallpaperConfig }
  'activity:year': { args: [input: { year: number; sources: ActivitySource[] }]; result: ActivityYear }
  'pageTime:track': { args: [input: { page: string; seconds: number }]; result: void }
  'pageTime:stats': { args: [year: number]; result: PageTimeStats }
  'ielts:studyPulse': { args: [input: { sessionId: string; active: boolean }]; result: void }
  'bills:account': { args: []; result: BillAccount | null }
  'bills:saveAccount': { args: [input: { email: string; authorizationCode: string }]; result: BillAccount }
  'bills:importFile': { args: []; result: BillFileSelection | null }
  'bills:unlockFile': { args: [input: { id: string; password: string }]; result: BillImportResult }
  'bills:cancelFileImport': { args: [id: string]; result: void }
  'bills:fetchFromMail': { args: [input: { password: string; sinceDays: number }]; result: BillImportResult }
  'bills:overview': { args: [input: { range: BillRange; page: number }]; result: BillOverview }
  'bills:rows': { args: [input: { range: BillRange; page: number; query?: string; direction?: 'income' | 'expense' }]; result: BillRowsPage }
  'bills:budget': { args: [input: { month: string }]; result: BillBudgetOverview }
  'bills:setBudget': { args: [input: { month: string; amountCents: number | null }]; result: void }
  'bills:rules': { args: []; result: BillRule[] }
  'bills:saveRule': { args: [input: { id?: string; pattern: string; category: string }]; result: BillRule[] }
  'bills:removeRule': { args: [id: string]; result: BillRule[] }
  'bills:applyRules': { args: []; result: { updated: number } }
  'app:getPaths': { args: []; result: AppPaths }
  'app:getVersion': { args: []; result: string }
  'app:relaunch': { args: []; result: void }
  'app:closeReady': { args: []; result: void }
  'app:flushNotesResult': { args: [requestId: string, saved: boolean]; result: void }
  'app:setWindowTheme': { args: [theme: 'light' | 'dark']; result: void }
  'app:setWallpaperContrast': { args: [dark: boolean]; result: void }
  'app:getLoginItem': { args: []; result: boolean }
  'app:setLoginItem': { args: [enabled: boolean]; result: boolean }
  'quick-capture:hide': { args: []; result: void }
  'settings:getAll': { args: []; result: Settings }
  'settings:set': { args: [key: string, value: string]; result: void }
  'settings:setPinnedModules': { args: [ids: string[]]; result: void }
  'notes:list': { args: [query: NoteQuery]; result: NoteSummary[] }
  'notes:listPage': { args: [query: NoteQuery]; result: NotePage }
  'notes:get': { args: [id: string]; result: Note | null }
  'notes:getJournal': { args: [date: string]; result: Note | null }
  'notes:save': { args: [input: NoteSaveInput]; result: Note }
  'notes:remove': { args: [id: string]; result: void }
  'notes:togglePin': { args: [id: string]; result: void }
  'notes:stats': { args: []; result: NoteStats }
  'notes:trash': { args: []; result: NoteSummary[] }
  'notes:archive': { args: [id: string]; result: void }
  'notes:restore': { args: [id: string]; result: void }
  'notes:export': { args: [input: { id: string; format: 'md' | 'html' | 'pdf' }]; result: { path: string } | null }
  'notes:wikiTarget': { args: [title: string]; result: { id: string } | null }
  'notes:backlinks': { args: [input: { title: string; excludeId?: string }]; result: NoteSummary[] }
  'libraryFolders:list': { args: [library: FolderLibrary]; result: LibraryFolder[] }
  'libraryFolders:save': { args: [library: FolderLibrary, input: LibraryFolderInput]; result: LibraryFolder }
  'libraryFolders:moveItem': { args: [library: FolderLibrary, itemId: string, folderId: string | null]; result: void }
  'libraryFolders:remove': { args: [library: FolderLibrary, id: string]; result: void }
  'memories:list': { args: [page: number, year?: string | null]; result: MemoryPage }
  'memories:save': { args: [input: MemoryInput]; result: MemoryEntry }
  'memories:remove': { args: [id: string]; result: void }
  'shelf:list': { args: [query: ShelfQuery]; result: ShelfItem[] }
  'shelf:stats': { args: []; result: ShelfStats }
  'shelf:save': { args: [input: ShelfInput]; result: ShelfItem }
  'shelf:remove': { args: [id: string]; result: void }
  'sources:list': { args: []; result: Source[] }
  'sources:entries': { args: [input: { sourceId: string; q?: string; unreadOnly?: boolean; page: number }]; result: SourceEntryPage }
  'sources:add': { args: [input: { name: string; url: string }]; result: Source[] }
  'sources:update': { args: [input: { id: string; name?: string; enabled?: boolean }]; result: Source[] }
  'sources:remove': { args: [id: string]; result: Source[] }
  'sources:refresh': { args: [input: { id: string | null }]; result: { results: SourceRefreshResult[] } }
  'sources:setRead': { args: [input: { id: string; read: boolean }]; result: void }
  'sources:readEntry': { args: [input: { id: string; download?: boolean }]; result: string | null }
  'sources:openEntry': { args: [id: string]; result: void }
  'todos:list': { args: []; result: Todo[] }
  'todos:stats': { args: []; result: TodoStats }
  'todos:save': { args: [input: TodoInput]; result: Todo }
  'todos:toggle': { args: [id: string]; result: Todo }
  'todos:remove': { args: [id: string]; result: void }
  'todos:clearDone': { args: []; result: void }
  'todos:reorder': { args: [ids: string[]]; result: void }
  'clipboard:list': { args: [query: ClipboardQuery]; result: ClipboardPage }
  'clipboard:copy': { args: [id: string]; result: boolean }
  'clipboard:togglePin': { args: [id: string]; result: ClipboardItem | null }
  'clipboard:remove': { args: [id: string]; result: void }
  'clipboard:clear': { args: []; result: void }
  'clipboard:setEnabled': { args: [enabled: boolean]; result: void }
  'ielts:sets': { args: []; result: IeltsSet[] }
  'ielts:reading': { args: [setId: string]; result: IeltsReading | null }
  'ielts:items': { args: [setId?: string]; result: IeltsItem[] }
  'ielts:generate': { args: [input: IeltsGenerateInput]; result: IeltsGenerateResult }
  'ielts:review': { args: [input: { id: string; known: boolean }]; result: IeltsItem }
  'ielts:removeSet': { args: [id: string]; result: void }
  'ielts:stats': { args: []; result: IeltsStats }
  'englishArticles:discover': { args: [topic: EnglishArticleTopic]; result: EnglishArticleSummary[] }
  'englishArticles:fetch': { args: [url: string]; result: EnglishArticle }
  'englishArticles:list': { args: []; result: EnglishArticleSummary[] }
  'englishArticles:get': { args: [id: string]; result: EnglishArticle | null }
  'englishArticles:save': { args: [article: EnglishArticle]; result: void }
  'englishArticles:refreshImages': { args: [id: string]; result: EnglishArticle }
  'englishArticles:remove': { args: [id: string]; result: void }
  'dailyBriefs:list': { args: []; result: DailyBriefStatus }
  'dailyBriefs:refresh': { args: []; result: void }
  'dailyBriefs:remove': { args: [date: string]; result: void }
  'habits:list': { args: []; result: HabitWithLogs[] }
  'habits:create': { args: [input: HabitInput]; result: HabitWithLogs[] }
  'habits:remove': { args: [id: string]; result: void }
  'habits:toggle': { args: [input: { id: string; date: string }]; result: HabitWithLogs[] }
  'habits:setCount': { args: [input: { id: string; date: string; count: number }]; result: HabitWithLogs[] }
  'focus:add': { args: [input: { minutes: number; label?: string }]; result: FocusStats }
  'focus:stats': { args: []; result: FocusStats }
  'focus:rename': { args: [input: { id: string; label: string }]; result: FocusStats }
  'focus:remove': { args: [id: string]; result: FocusStats }
  'ai:config': { args: []; result: AIConfig }
  'ai:saveConfig': { args: [input: AIConfigInput]; result: AIConfig }
  'ai:test': { args: []; result: string }
  'ai:generateArticle': { args: [input: ArticleGenerateInput]; result: ArticleDraft }
  'ai:dailyReport': { args: [input: { date?: string }]; result: { content: string } }
  'articleReferences:discover': { args: [query: RankingQuery | ArticleCategory]; result: ReferenceRanking }
  'articleReferences:analyze': { args: [input: AnalyzeReferencesInput]; result: ReferenceAnalysis }
  'articleReferences:create': { args: [input: CreateReferenceContentInput]; result: ReferenceContent }
  'ai:chat': { args: [input: ChatRequest]; result: ChatResult }
  'ai:regenerate': { args: [input: { requestId: string; threadId: string }]; result: ChatResult }
  'ai:abort': { args: [requestId: string]; result: void }
  'ai:threads:list': { args: []; result: AIThread[] }
  'ai:threads:create': { args: []; result: AIThread }
  'ai:threads:messages': { args: [threadId: string]; result: AIMessage[] }
  'ai:threads:rename': { args: [id: string, title: string]; result: void }
  'ai:threads:remove': { args: [id: string]; result: void }
  'assets:saveImage': { args: [dataUrl: string]; result: { url: string } }
  'skills:list': { args: [query: SkillQuery]; result: SkillSummary[] }
  'skills:get': { args: [id: string]; result: SkillDetail | null }
  'skills:save': { args: [input: SkillInput]; result: SkillDetail }
  'skills:create': { args: [input?: { fromId?: string }]; result: SkillDetail }
  'skills:remove': { args: [id: string]; result: void }
  'skills:togglePin': { args: [id: string]; result: void }
  'skills:importZip': { args: []; result: SkillImportResult }
  'skills:importDirectory': { args: []; result: SkillImportResult }
  'skills:importMarkdown': { args: []; result: SkillImportResult }
  'skills:importPath': { args: [path: string]; result: SkillImportResult }
  'skills:chooseCover': { args: [id: string, kind: 'image' | 'video']; result: SkillDetail | null }
  'skills:setCoverUrl': { args: [id: string, input: { url: string; kind: 'image' | 'video' }]; result: SkillDetail }
  'skills:clearCover': { args: [id: string]; result: SkillDetail }
  'skills:reveal': { args: [id: string]; result: void }
  'data:export': { args: []; result: BackupResult | null }
  'data:reveal': { args: []; result: void }
  'data:storage': { args: []; result: StorageInfo }
  'data:chooseDirectory': { args: []; result: string | null }
  'data:relocateDefault': { args: []; result: string }
}
