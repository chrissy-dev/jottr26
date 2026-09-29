import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getExtensionField, type KeyboardShortcutCommand } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { headlessEditor } from './editor'

const TIPTAP_OWN = new Set(['keymap', 'listKeymap'])

describe('keyboard shortcuts', () => {
  it('dispatch nothing for a key none of them takes', () => {
    const title = { type: 'title', content: [{ type: 'text', text: 'N' }] }
    const line = { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }
    // Mid-word, where every Backspace binding in the page's extensions declines.
    const instance = headlessEditor({ type: 'doc', content: [title, line] }, 6)
    let dispatched = 0
    instance.on('transaction', () => {
      dispatched += 1
    })

    let bindings = 0
    for (const extension of instance.extensionManager.extensions) {
      if (extension.type === 'mark') continue
      const shortcuts = getExtensionField<() => Record<string, KeyboardShortcutCommand>>(
        extension,
        'addKeyboardShortcuts',
        {
          name: extension.name,
          options: extension.options,
          storage: extension.storage,
          editor: instance,
          type: instance.schema.nodes[extension.name],
        },
      )
      const backspace = shortcuts?.().Backspace
      // Tiptap's own keymaps run through its command chain, which dispatches
      // whatever they return. Only this app's bindings are in question here.
      if (!backspace || TIPTAP_OWN.has(extension.name)) continue
      assert.equal(backspace({ editor: instance }), false, extension.name)
      bindings += 1
    }

    assert.ok(bindings > 3, 'several extensions bind Backspace')
    assert.equal(dispatched, 0)
  })

  it('take Backspace from the top of the body to the end of the title with Shift held, as iOS holds it there', () => {
    const title = { type: 'title', content: [{ type: 'text', text: 'Notes' }] }
    const line = { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }
    const instance = headlessEditor({ type: 'doc', content: [title, line] }, 8)
    const event = { key: 'Backspace', keyCode: 8, shiftKey: true, altKey: false, ctrlKey: false, metaKey: false }

    // The key goes to each plugin in turn, in the order the view would hand
    // it out, until one takes it. A headless editor only has them listed.
    const view = { state: instance.state, dispatch: instance.view.dispatch }
    const handled = instance.extensionManager.plugins.some((plugin) =>
      plugin.props.handleKeyDown?.call(plugin, view as never, event as KeyboardEvent),
    )

    assert.ok(handled)
    const { selection } = instance.state
    assert.ok(selection instanceof TextSelection && selection.empty, 'a caret, not the title selected whole')
    assert.equal(selection.head, 6)
  })
})
