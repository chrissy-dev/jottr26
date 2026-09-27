import { Extension } from '@tiptap/core'
import { type EditorState, Plugin } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const EMPTY_PAGE_HINT = "Write something, or press '/' for blocks"

/** Where the hint goes: the empty line with the caret, but only while the
 *  page has no body yet — nothing after the title but empty paragraphs,
 *  however many. A blank line on a page with content gets none. */
export function emptyPageHintAt(state: EditorState): { from: number; to: number } | null {
  const { doc, selection } = state
  const { anchor } = selection
  // No title yet, as a document mid-way through binding to Yjs can be.
  if (!doc.firstChild) return null
  let pos = doc.firstChild.nodeSize
  let hint: { from: number; to: number } | null = null
  for (let index = 1; index < doc.childCount; index += 1) {
    const block = doc.child(index)
    if (block.type.name !== 'paragraph' || block.childCount > 0) return null
    const end = pos + block.nodeSize
    if (!hint && anchor >= pos && anchor <= end) hint = { from: pos, to: end }
    pos = end
  }
  return hint
}

/** The body's hint on an empty page. Not Placeholder's callback: that asks
 *  about one block at a time and is handed the document from before the
 *  change, while this depends on every block, as they are now. */
export const EmptyPageHint = Extension.create({
  name: 'emptyPageHint',

  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        props: {
          decorations(state) {
            if (!editor.isEditable) return null
            const hint = emptyPageHintAt(state)
            if (!hint) return null
            return DecorationSet.create(state.doc, [
              Decoration.node(hint.from, hint.to, { class: 'empty-page-hint', 'data-hint': EMPTY_PAGE_HINT }),
            ])
          },
        },
      }),
    ]
  },
})
