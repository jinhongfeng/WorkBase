import type { WorkBaseAPI } from '@shared/types'
declare global {
  interface Window { api: WorkBaseAPI; toast: { success(message: string, action?: { label: string; onClick(): void }): void; error(message: string): void } }
}
