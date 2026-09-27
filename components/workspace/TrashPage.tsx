'use client'

import { Icon } from '@/components/ui/Icon'
import { emptyTrash, restorePage } from '@/lib/db/pages'
import type { PageRow } from '@/lib/db/schema'

const when = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

const count = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`

/** Sits where a page's trail and star would: how many pages are in the trash
 *  on the left, and the button to empty it on the right, in the star's pale
 *  box. */
export function TrashBar({ pages }: { pages: PageRow[] }) {
  return (
    <>
      <span className="flex h-8 items-center text-faint pointer-coarse:h-10">{count(pages.length)}</span>
      <button
        type="button"
        onClick={() => {
          if (window.confirm(`Permanently delete ${count(pages.length)}? This cannot be undone.`)) {
            void emptyTrash()
          }
        }}
        className="pointer-events-auto ml-auto flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-sunken px-3 font-medium text-danger shadow-[var(--shadow-subtle)] transition-colors hover:bg-[var(--hover)] pointer-coarse:h-10"
      >
        <Icon name="trash" size={16} strokeWidth={1.8} />
        Empty trash
      </button>
    </>
  )
}

/** Laid out like a note: the same title, then the trashed pages where the body
 *  would be. It sits in the page's column, so it takes the page's padding. */
export function TrashPage({ pages }: { pages: PageRow[] }) {
  return (
    <>
      <h1 className="page-title">Trash</h1>

      {pages.length > 0 && (
        <ul>
          {pages.map((page) => (
            <li key={page.id} className="flex items-center gap-2 py-2">
              <span className="flex h-[1lh] w-4 shrink-0 items-center justify-center self-start text-[length:var(--body-size)]">
                <Icon name="file" size={15} className="text-faint" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[length:var(--body-size)] text-ink">
                  {page.title || 'Untitled'}
                </span>
                <span className="block text-[12.5px] text-faint pointer-coarse:text-[13.5px]">
                  Deleted {when.format(page.deletedAt)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void restorePage(page.id)}
                className="px-1 font-medium text-accent hover:underline pointer-coarse:py-2"
              >
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
