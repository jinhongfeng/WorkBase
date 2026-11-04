import type { AppPaths, Settings } from './types'
export const channels = {
  getPaths: 'app:getPaths', getVersion: 'app:getVersion',
  getAll: 'settings:getAll', set: 'settings:set', setPinnedModules: 'settings:setPinnedModules'
} as const
export interface IPCContract {
  'app:getPaths': { args: []; result: AppPaths }
  'app:getVersion': { args: []; result: string }
  'settings:getAll': { args: []; result: Settings }
  'settings:set': { args: [key: string, value: string]; result: void }
  'settings:setPinnedModules': { args: [ids: string[]]; result: void }
}
