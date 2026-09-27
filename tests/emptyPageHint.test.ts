import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { TextSelection } from '@tiptap/pm/state'
import { emptyPageHintAt } from '@/components/editor/extensions/emptyPageHint'
import { caretAt, page, paragraph } from './editor'

/** The index of the body block the hint sits on, or null. */
function hinted(state: ReturnType<typeof page>) {
  const hint = emptyPageHintAt(state)
  if (!hint) return null
  let pos = 0
  for (let index = 0; index < state.doc.childCount; index += 1) {
    if (pos === hint.from) return index
    pos += state.doc.child(index).nodeSize
  }
  assert.fail('the hint should start at a block')
}

describe('the empty page hint', () => {
  it('sits on the empty line with the caret while the page has no body', () => {
    assert.equal(hinted(page(paragraph())), 1)
    assert.equal(hinted(page(paragraph(), paragraph())), 2)
  })

  it('stays off a page with content, even on a blank line', () => {
    assert.equal(hinted(page(paragraph('hello'), paragraph())), null)
  })

  it('stays off while the caret is in the title', () => {
    const state = page(paragraph())
    assert.equal(hinted(caretAt(state, 1)), null)
  })

  it('comes back as soon as the last of the body is deleted', () => {
    // The case the old per-block callback got wrong: it was handed the
    // document from before the deletion, which still had 'hello' in it.
    let state = page(paragraph('hello'))
    const start = state.doc.child(0).nodeSize + 1
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, start, start + 5)))
    state = state.apply(state.tr.deleteSelection())
    assert.equal(hinted(state), 1)
  })
})
