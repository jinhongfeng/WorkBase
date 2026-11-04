export interface AppPaths { userData: string; database: string; files: string }
export type Settings = Record<string, string>
export interface WorkBaseAPI {
  app: { getPaths(): Promise<AppPaths>; getVersion(): Promise<string> }
  settings: {
    getAll(): Promise<Settings>
    set(key: string, value: string): Promise<void>
    setPinnedModules(ids: string[]): Promise<void>
  }
}
