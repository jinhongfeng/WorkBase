import type { WorkBaseAPI } from '@shared/types'
declare global {
  interface Window { api: WorkBaseAPI; toast: { success(message: string): void; error(message: string): void } }
}
