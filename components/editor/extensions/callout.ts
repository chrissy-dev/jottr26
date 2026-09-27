import { mergeAttributes, Node } from '@tiptap/core'
import { wrapIn } from '@tiptap/pm/commands'
import type { Command } from '@tiptap/pm/state'
import { leaveBox } from './accordion'
import { pm } from './helpers'

/** A callout: a padded box that sets a passage apart from the page around it.
 *
 *  It wraps blocks rather than holding inline content of its own, so a callout
 *  can carry a list, a code block or several paragraphs, and it is the only
 *  block here that sets a passage apart — the editor has no blockquote.
 *
 *  No attributes, on purpose. There is nothing here to pick a colour or an icon
 *  for, so there is nothing for two devices to disagree about: the node rides
 *  the CRDT as plain structure, and a callout typed on a phone is the same
 *  callout on a laptop. */

/** Enter, on an empty last line of a callout: out of the box, onto a new line
 *  below it.
 *
 *  Everywhere else in the box Enter is a new line inside it, as it is in an
 *  accordion's box and at the end of a list: Enter carries on, and Enter on a
 *  blank line gets you out. That needs no Shift, which a phone keyboard does
 *  not have, and it still gets you underneath a callout at the foot of a page.
 *
 *  The blank line goes with you rather than staying behind as an empty row,
 *  unless it is the box's only one: then it stays, and so does the box, empty
 *  to come back to, as an accordion's does.
 *
 *  Only for a paragraph the callout holds directly. Inside a list in a callout
 *  Enter still means 'next item', which is what the list's own binding does
 *  with it once this declines. */
export function leaveCallout(name: string): Command {
  return leaveBox(name, 1)
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      /** Wrap the selection in a callout, even one already in a callout: boxes
       *  nest, as accordions do. */
      setCallout: () => ReturnType
    }
  }
}

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  /** Pasting into a callout replaces the blocks inside it rather than
   *  dissolving the box around them. */
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'callout' }), 0]
  },

  addCommands() {
    return {
      setCallout:
        () =>
        ({ state, dispatch }) =>
          wrapIn(this.type)(state, dispatch),
    }
  },

  addKeyboardShortcuts() {
    return {
      Enter: pm(this.editor, leaveCallout(this.name)),
    }
  },
})
