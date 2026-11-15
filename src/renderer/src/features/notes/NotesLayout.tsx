import { useLayoutEffect, type ReactNode } from 'react'
import { COLLAPSED_LIST_WIDTH, ListSidebar, useListSidebar } from '../../components/ui/ListSidebar'
import { PanelResizeHandle, usePanelLayoutWidth, usePanelWidth } from '../../components/ui/PanelResizeHandle'
import { clamp } from '../../lib/utils'

const DEFAULT_LIST_WIDTH = 260
const MIN_LIST_WIDTH = 240
const MAX_LIST_WIDTH = 520
const MIN_EDITOR_WIDTH = 424
const MIN_OUTLINE_WIDTH = 152
const DEFAULT_OUTLINE_WIDTH = 200
const MAX_OUTLINE_WIDTH = 480

type Props = { list: ReactNode; listLabel: string; children: ReactNode; outline: ReactNode }

export function NotesLayout({ list, listLabel, children, outline }: Props) {
  const [layout, availableWidth] = usePanelLayoutWidth()
  const { collapsed, toggle } = useListSidebar('ui.notes.listCollapsed')
  const listSize = usePanelWidth('ui.notes.listWidth', MIN_LIST_WIDTH, MAX_LIST_WIDTH)
  const outlineSize = usePanelWidth('ui.notes.outlineWidth', MIN_OUTLINE_WIDTH, MAX_OUTLINE_WIDTH)
  const outlineVisible = Boolean(outline)
  const { setPreview: previewOutline } = outlineSize
  useLayoutEffect(() => {
    if (!outlineVisible) previewOutline(null)
  }, [outlineVisible, previewOutline])

  const minOutline = outlineVisible ? MIN_OUTLINE_WIDTH : 0
  const minList = collapsed ? COLLAPSED_LIST_WIDTH : MIN_LIST_WIDTH
  const availableForPanels = Math.max(minList + minOutline, availableWidth - MIN_EDITOR_WIDTH)
  const preferredList = listSize.preferred ?? DEFAULT_LIST_WIDTH
  const preferredOutline = outlineSize.preferred ?? DEFAULT_OUTLINE_WIDTH

  // Bound each drag against the other panel's resting width so it stays in place during the drag.
  const restingList = collapsed ? COLLAPSED_LIST_WIDTH : Math.min(preferredList, availableForPanels - minOutline)
  const maxOutline = Math.min(MAX_OUTLINE_WIDTH, availableForPanels - restingList)
  const restingOutline = outlineVisible ? Math.min(preferredOutline, maxOutline) : 0
  const maxList = Math.min(MAX_LIST_WIDTH, availableForPanels - restingOutline)
  const listWidth = collapsed ? COLLAPSED_LIST_WIDTH : clamp(listSize.preview ?? restingList, MIN_LIST_WIDTH, maxList)
  const outlineWidth = outlineVisible
    ? clamp(outlineSize.preview ?? restingOutline, MIN_OUTLINE_WIDTH, maxOutline)
    : 0

  const columns = `${listWidth}px ${collapsed ? '' : '0 '}minmax(0, 1fr)`
  return (
    <div className="notes-app" data-outline={outlineVisible} ref={layout}
      style={{ gridTemplateColumns: outlineVisible ? `${columns} 0 ${outlineWidth}px` : columns }}>
      <ListSidebar id="notes-list-panel" className="notes-side" label={listLabel} collapsed={collapsed}
        onToggle={() => { listSize.setPreview(null); toggle() }}>
        {list}
      </ListSidebar>
      {!collapsed && <PanelResizeHandle side="left" controls="notes-list-panel" label="调整笔记列表宽度"
        width={listWidth} min={MIN_LIST_WIDTH} max={maxList}
        onPreview={listSize.setPreview} onCommit={listSize.commit} />}
      {children}
      {outlineVisible && (
        <>
          <PanelResizeHandle side="right" controls="notes-outline" label="调整大纲宽度"
            width={outlineWidth} min={MIN_OUTLINE_WIDTH} max={maxOutline}
            onPreview={outlineSize.setPreview} onCommit={outlineSize.commit} />
          {outline}
        </>
      )}
    </div>
  )
}
