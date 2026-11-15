import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import { TableKit } from '@tiptap/extension-table'
import { NoteImageNode, NoteImageRow } from './imageLayout'

/**
 * 笔记编辑器扩展集。抽成独立常量，让运行时校验脚本与真实编辑器共用同一份配置，
 * 避免「测试通过但编辑器少注册表格 schema」这类偏差。
 */
export const noteExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3, 4] },
    link: { openOnClick: false, autolink: true }
  }),
  NoteImageNode.configure({ inline: false, allowBase64: false }),
  NoteImageRow,
  // 表格：Markdown GFM 表格与编辑器双向转换都依赖这套 schema，缺了它粘贴/读入的表格会被拍平成文本
  TableKit.configure({
    // renderWrapper 让宽表格在自己的容器里横向滚动，不把正文撑破
    table: { resizable: false, lastColumnResizable: false, allowTableNodeSelection: true, renderWrapper: true }
  }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Placeholder.configure({ placeholder: '开始写点什么… 输入 # 生成标题，粘贴图片可直接插入' })
]
