import type { NoteKind } from '@shared/types'

export interface NoteForm {
  title: string
  content: string
  tags: string
  kind: NoteKind
  journalDate: string | null
}

interface NoteSaver {
  save(): Promise<boolean>
  draft(): { id: string; form: NoteForm } | null
  detached: boolean
}

const savers = new Set<NoteSaver>()

async function flush(saver: NoteSaver): Promise<boolean> {
  const saved = await saver.save()
  if (saved && saver.detached) savers.delete(saver)
  return saved
}

export function attachNoteSaver(save: NoteSaver['save'], draft: NoteSaver['draft']): () => void {
  const saver = { save, draft, detached: false }
  savers.add(saver)
  return () => {
    saver.detached = true
    void flush(saver)
  }
}

export async function recoverDetachedNote(id: string): Promise<(() => NoteForm | null) | null> {
  const saver = [...savers].find(item => item.detached && item.draft()?.id === id)
  if (!saver || await flush(saver)) return null
  // 只有真正打开这篇笔记时才把草稿移交给新编辑器。
  return () => savers.delete(saver) ? saver.draft()?.form ?? null : null
}

export async function flushPendingNotes(): Promise<boolean> {
  const results = await Promise.all([...savers].map(flush))
  return results.every(Boolean)
}
