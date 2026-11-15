import { create } from 'zustand'
import { articleCategories, type ArticleCategory, type ArticleDraft, type ArticleGenerateInput } from '@shared/article-writing'
import { humanError } from '../../lib/utils'

type EditableField = 'title' | 'lead' | 'body' | 'summary'

interface WritingState {
  input: ArticleGenerateInput
  draft: ArticleDraft | null
  draftCategory: ArticleCategory
  savedDraft: ArticleDraft | null
  savedNoteId: string | null
  generating: boolean
  saving: boolean
  error: string
  setInput(input: Partial<ArticleGenerateInput>): void
  edit(field: EditableField, value: string): void
  generate(): Promise<void>
  save(): Promise<void>
}

export const useWriting = create<WritingState>((set, get) => ({
  input: { category: 'humanities', topic: '' },
  draft: null,
  draftCategory: 'humanities',
  savedDraft: null,
  savedNoteId: null,
  generating: false,
  saving: false,
  error: '',
  setInput: input => set(state => ({ input: { ...state.input, ...input } })),
  edit: (field, value) => {
    const { draft } = get()
    if (draft) set({ draft: { ...draft, [field]: value } })
  },
  generate: async () => {
    const { input, generating, saving } = get()
    if (generating || saving) return
    set({ generating: true, error: '' })
    try {
      const draft = await window.api.ai.generateArticle(input)
      set({ draft, draftCategory: input.category, savedDraft: null, savedNoteId: null })
    } catch (error) {
      set({ error: humanError(error) })
    } finally {
      set({ generating: false })
    }
  },
  save: async () => {
    const { draft, draftCategory, savedDraft, generating, saving } = get()
    if (!draft || draft === savedDraft || generating || saving) return
    set({ saving: true })
    try {
      const checks = draft.factChecks.map(item => `- ${item.replace(/\s+/g, ' ')}`).join('\n')
      const content = [draft.lead.trim(), draft.body.trim()]
      if (draft.summary.trim()) content.push(`## 发布摘要\n\n${draft.summary.trim()}`)
      if (checks) content.push(`## 待核实事项\n\n${checks}`)
      const note = await window.api.notes.save({
        title: draft.title.trim(), content: content.filter(Boolean).join('\n\n'),
        tags: ['自媒体', articleCategories[draftCategory]], kind: 'note'
      })
      set({ savedDraft: draft, savedNoteId: note.id })
      window.toast.success('已保存到笔记')
    } catch (error) {
      window.toast.error(humanError(error))
    } finally {
      set({ saving: false })
    }
  }
}))
