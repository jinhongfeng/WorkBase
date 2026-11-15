import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { channels } from '@shared/ipc-contract'
import type { WorkBaseAPI } from '@shared/types'

export type { WorkBaseAPI, AppPaths, Settings } from '@shared/types'

const api: WorkBaseAPI = {
  plugins: {
    list: () => ipcRenderer.invoke(channels.pluginsList),
    onChanged: callback => {
      const listener = (): void => callback()
      ipcRenderer.on(channels.pluginsChanged, listener)
      return () => { ipcRenderer.removeListener(channels.pluginsChanged, listener) }
    },
    openDirectory: () => ipcRenderer.invoke(channels.pluginsOpenDirectory)
  },
  vault: {
    status: () => ipcRenderer.invoke(channels.vaultStatus),
    open: (passphrase, create) => ipcRenderer.invoke(channels.vaultOpen, passphrase, create),
    lock: () => ipcRenderer.invoke(channels.vaultLock),
    list: () => ipcRenderer.invoke(channels.vaultList),
    save: input => ipcRenderer.invoke(channels.vaultSave, input),
    remove: id => ipcRenderer.invoke(channels.vaultRemove, id),
    connectBrowser: () => ipcRenderer.invoke(channels.vaultConnect),
    disconnectBrowser: () => ipcRenderer.invoke(channels.vaultDisconnect)
  },
  media: {
    list: query => ipcRenderer.invoke(channels.mediaList, query),
    listGroups: () => ipcRenderer.invoke(channels.mediaListGroups),
    saveGroup: input => ipcRenderer.invoke(channels.mediaSaveGroup, input),
    removeGroup: id => ipcRenderer.invoke(channels.mediaRemoveGroup, id),
    moveToGroup: (id, groupId) => ipcRenderer.invoke(channels.mediaMoveToGroup, id, groupId),
    saveLocalFiles: groupId => ipcRenderer.invoke(channels.mediaSaveLocal, groupId),
    saveLocalPaths: (paths, groupId) => ipcRenderer.invoke(channels.mediaSaveLocalPaths, paths, groupId),
    saveBuffers: (inputs, groupId) => ipcRenderer.invoke(channels.mediaSaveBuffers, inputs, groupId),
    saveFromUrl: input => ipcRenderer.invoke(channels.mediaSaveUrl, input),
    remove: id => ipcRenderer.invoke(channels.mediaRemove, id),
    reveal: id => ipcRenderer.invoke(channels.mediaReveal, id),
    openExternal: id => ipcRenderer.invoke(channels.mediaOpenExternal, id)
  },
  wallpaper: {
    get: scope => ipcRenderer.invoke(channels.wallpaperGet, scope),
    addUrl: (input, scope) => ipcRenderer.invoke(channels.wallpaperAddUrl, input, scope),
    addFile: scope => ipcRenderer.invoke(channels.wallpaperAddFile, scope),
    addSystem: scope => ipcRenderer.invoke(channels.wallpaperAddSystem, scope),
    listEngine: () => ipcRenderer.invoke(channels.wallpaperEngineList),
    chooseEngineDirectory: () => ipcRenderer.invoke(channels.wallpaperEngineChooseDirectory),
    addEngine: (id, scope) => ipcRenderer.invoke(channels.wallpaperAddEngine, id, scope),
    remove: (id, scope) => ipcRenderer.invoke(channels.wallpaperRemove, id, scope),
    setActive: (id, scope) => ipcRenderer.invoke(channels.wallpaperSetActive, id, scope),
    updateConfig: (input, scope) => ipcRenderer.invoke(channels.wallpaperUpdateConfig, input, scope),
    clear: scope => ipcRenderer.invoke(channels.wallpaperClear, scope)
  },
  activity: { year: input => ipcRenderer.invoke(channels.activityYear, input) },
  bills: {
    account: () => ipcRenderer.invoke(channels.billAccount),
    saveAccount: input => ipcRenderer.invoke(channels.billSaveAccount, input),
    importFile: () => ipcRenderer.invoke(channels.billImportFile),
    unlockFile: input => ipcRenderer.invoke(channels.billUnlockFile, input),
    cancelFileImport: id => ipcRenderer.invoke(channels.billCancelFileImport, id),
    fetchFromMail: input => ipcRenderer.invoke(channels.billFetchMail, input),
    overview: input => ipcRenderer.invoke(channels.billOverview, input),
    rows: input => ipcRenderer.invoke(channels.billRows, input)
  },
  app: {
    getPaths: () => ipcRenderer.invoke(channels.getPaths),
    getVersion: () => ipcRenderer.invoke(channels.getVersion),
    setWindowTheme: theme => ipcRenderer.invoke(channels.setWindowTheme, theme),
    setWallpaperContrast: dark => ipcRenderer.invoke(channels.appSetWallpaperContrast, dark),
    relaunch: () => ipcRenderer.invoke(channels.appRelaunch),
    onBeforeClose: save => {
      const handler = async (_event: IpcRendererEvent, requestId: string): Promise<void> => {
        let saved = false
        try { saved = await save() } catch { /* 退出前保存失败时保持窗口。 */ }
        await ipcRenderer.invoke(channels.appFlushNotesResult, requestId, saved)
      }
      const onFlush = (event: IpcRendererEvent, requestId: string): void => { void handler(event, requestId).catch(() => undefined) }
      ipcRenderer.on(channels.appFlushNotes, onFlush)
      void ipcRenderer.invoke(channels.appCloseReady).catch(() => undefined)
      return () => { ipcRenderer.removeListener(channels.appFlushNotes, onFlush) }
    },
    getFilePath: file => webUtils.getPathForFile(file),
    getLoginItem: () => ipcRenderer.invoke(channels.appGetLoginItem),
    setLoginItem: enabled => ipcRenderer.invoke(channels.appSetLoginItem, enabled)
  },
  settings: {
    getAll: () => ipcRenderer.invoke(channels.getAll),
    set: (key, value) => ipcRenderer.invoke(channels.set, key, value),
    setPinnedModules: ids => ipcRenderer.invoke(channels.setPinnedModules, ids)
  },
  memories: {
    list: (page, year, query) => ipcRenderer.invoke(channels.memoriesList, page, year, query ?? null),
    save: input => ipcRenderer.invoke(channels.memoriesSave, input),
    remove: id => ipcRenderer.invoke(channels.memoriesRemove, id)
  },
  notes: {
    list: query => ipcRenderer.invoke(channels.notesList, query),
    listPage: query => ipcRenderer.invoke(channels.notesListPage, query),
    get: id => ipcRenderer.invoke(channels.notesGet, id),
    getJournal: date => ipcRenderer.invoke(channels.notesGetJournal, date),
    save: input => ipcRenderer.invoke(channels.notesSave, input),
    remove: id => ipcRenderer.invoke(channels.notesRemove, id),
    togglePin: id => ipcRenderer.invoke(channels.notesPin, id),
    stats: () => ipcRenderer.invoke(channels.notesStats),
    trash: () => ipcRenderer.invoke(channels.notesTrash),
    archive: id => ipcRenderer.invoke(channels.notesArchive, id),
    restore: id => ipcRenderer.invoke(channels.notesRestore, id)
  },
  libraryFolders: {
    list: library => ipcRenderer.invoke(channels.libraryFoldersList, library),
    save: (library, input) => ipcRenderer.invoke(channels.libraryFoldersSave, library, input),
    moveItem: (library, itemId, folderId) => ipcRenderer.invoke(channels.libraryFoldersMove, library, itemId, folderId),
    remove: (library, id) => ipcRenderer.invoke(channels.libraryFoldersRemove, library, id)
  },
  todos: {
    list: () => ipcRenderer.invoke(channels.todosList),
    stats: () => ipcRenderer.invoke(channels.todosStats),
    save: input => ipcRenderer.invoke(channels.todosSave, input),
    toggle: id => ipcRenderer.invoke(channels.todosToggle, id),
    remove: id => ipcRenderer.invoke(channels.todosRemove, id),
    clearDone: () => ipcRenderer.invoke(channels.todosClearDone)
  },
  ielts: {
    studyPulse: input => ipcRenderer.invoke(channels.ieltsStudyPulse, input),
    sets: () => ipcRenderer.invoke(channels.ieltsSets),
    reading: setId => ipcRenderer.invoke(channels.ieltsReading, setId),
    items: setId => ipcRenderer.invoke(channels.ieltsItems, setId),
    generate: input => ipcRenderer.invoke(channels.ieltsGenerate, input),
    review: input => ipcRenderer.invoke(channels.ieltsReview, input),
    removeSet: id => ipcRenderer.invoke(channels.ieltsRemoveSet, id),
    stats: () => ipcRenderer.invoke(channels.ieltsStats)
  },
  dailyBriefs: {
    list: () => ipcRenderer.invoke(channels.dailyBriefsList),
    refresh: () => ipcRenderer.invoke(channels.dailyBriefsRefresh),
    remove: date => ipcRenderer.invoke(channels.dailyBriefsRemove, date),
    onChanged: callback => {
      const listener = (): void => callback()
      ipcRenderer.on(channels.dailyBriefsChanged, listener)
      return () => { ipcRenderer.removeListener(channels.dailyBriefsChanged, listener) }
    }
  },
  englishArticles: {
    discover: topic => ipcRenderer.invoke(channels.englishArticlesDiscover, topic),
    fetch: url => ipcRenderer.invoke(channels.englishArticlesFetch, url),
    list: () => ipcRenderer.invoke(channels.englishArticlesList),
    get: id => ipcRenderer.invoke(channels.englishArticlesGet, id),
    save: article => ipcRenderer.invoke(channels.englishArticlesSave, article),
    refreshImages: id => ipcRenderer.invoke(channels.englishArticlesRefreshImages, id),
    remove: id => ipcRenderer.invoke(channels.englishArticlesRemove, id)
  },
  habits: {
    list: () => ipcRenderer.invoke(channels.habitsList),
    create: input => ipcRenderer.invoke(channels.habitsCreate, input),
    remove: id => ipcRenderer.invoke(channels.habitsRemove, id),
    toggle: input => ipcRenderer.invoke(channels.habitsToggle, input),
    setCount: input => ipcRenderer.invoke(channels.habitsSetCount, input)
  },
  focus: {
    add: input => ipcRenderer.invoke(channels.focusAdd, input),
    stats: () => ipcRenderer.invoke(channels.focusStats)
  },
  ai: {
    config: () => ipcRenderer.invoke(channels.aiConfig),
    saveConfig: input => ipcRenderer.invoke(channels.aiSaveConfig, input),
    test: () => ipcRenderer.invoke(channels.aiTest),
    generateArticle: input => ipcRenderer.invoke(channels.aiGenerateArticle, input),
    chat: input => ipcRenderer.invoke(channels.aiChat, input),
    regenerate: input => ipcRenderer.invoke(channels.aiRegenerate, input),
    abort: requestId => ipcRenderer.invoke(channels.aiAbort, requestId),
    threads: {
      list: () => ipcRenderer.invoke(channels.aiThreadsList),
      create: () => ipcRenderer.invoke(channels.aiThreadsCreate),
      messages: id => ipcRenderer.invoke(channels.aiThreadsMessages, id),
      rename: (id, title) => ipcRenderer.invoke(channels.aiThreadsRename, id, title),
      remove: id => ipcRenderer.invoke(channels.aiThreadsRemove, id)
    },
    onDelta: listener => {
      const handler = (_event: IpcRendererEvent, requestId: string, text: string): void => listener(requestId, text)
      ipcRenderer.on(channels.aiDelta, handler)
      return () => { ipcRenderer.removeListener(channels.aiDelta, handler) }
    }
  },
  articleReferences: {
    discover: query => ipcRenderer.invoke(channels.articleReferencesDiscover, query),
    analyze: input => ipcRenderer.invoke(channels.articleReferencesAnalyze, input),
    create: input => ipcRenderer.invoke(channels.articleReferencesCreate, input)
  },
  assets: {
    saveImage: dataUrl => ipcRenderer.invoke(channels.assetsSaveImage, dataUrl)
  },
  skills: {
    list: query => ipcRenderer.invoke(channels.skillsList, query),
    get: id => ipcRenderer.invoke(channels.skillsGet, id),
    save: input => ipcRenderer.invoke(channels.skillsSave, input),
    create: input => ipcRenderer.invoke(channels.skillsCreate, input),
    remove: id => ipcRenderer.invoke(channels.skillsRemove, id),
    togglePin: id => ipcRenderer.invoke(channels.skillsPin, id),
    importZip: () => ipcRenderer.invoke(channels.skillsImportZip),
    importDirectory: () => ipcRenderer.invoke(channels.skillsImportDir),
    importMarkdown: () => ipcRenderer.invoke(channels.skillsImportMd),
    importPath: path => ipcRenderer.invoke(channels.skillsImportPath, path),
    chooseCover: (id, kind) => ipcRenderer.invoke(channels.skillsChooseCover, id, kind),
    setCoverUrl: (id, input) => ipcRenderer.invoke(channels.skillsSetCoverUrl, id, input),
    clearCover: id => ipcRenderer.invoke(channels.skillsClearCover, id),
    reveal: id => ipcRenderer.invoke(channels.skillsReveal, id)
  },
  data: {
    export: () => ipcRenderer.invoke(channels.dataExport),
    reveal: () => ipcRenderer.invoke(channels.dataReveal),
    storage: () => ipcRenderer.invoke(channels.dataStorage),
    chooseDirectory: () => ipcRenderer.invoke(channels.dataChooseDirectory),
    relocateDefault: () => ipcRenderer.invoke(channels.dataRelocateDefault)
  }
}

contextBridge.exposeInMainWorld('api', api)
