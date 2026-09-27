'use client'

import { useMemo } from 'react'
import { Icon, type IconName } from '@/components/ui/Icon'
import { PageTree } from './PageTree'
import { buildTree, useDrawnRows, type TreeNode } from '@/lib/db/hooks'
import { createPage } from '@/lib/db/pages'
import {
  toggleExpanded,
  toggleExpandedFavourite,
  useExpanded,
  useExpandedFavourites,
} from '@/lib/util/expanded'
import { raiseKeyboard } from '@/lib/util/keyboard'
import type { View } from '@/lib/util/route'
import type { PageRow } from '@/lib/db/schema'

export function Sidebar({
  pages,
  openId,
  onOpen,
  view,
  onOpenView,
}: {
  pages: PageRow[]
  openId: string | null
  onOpen: (id: string | null) => void
  view: View | null
  onOpenView: (view: View) => void
}) {
  const expanded = useExpanded()
  const expandedFavourites = useExpandedFavourites()

  // Sync rewrites rows' bookkeeping, which the sidebar doesn't draw; kept rows
  // mean the tree isn't rebuilt or redrawn for it.
  const rows = useDrawnRows(pages)
  const tree: TreeNode[] = useMemo(() => buildTree(rows), [rows])
  // Each favourite with its subpages, taken from the tree so they read the
  // same in both sections.
  const favourites: TreeNode[] = useMemo(() => {
    const nodes = new Map<string, TreeNode>()
    const walk = (list: TreeNode[]) => {
      for (const node of list) {
        nodes.set(node.page.id, node)
        walk(node.children)
      }
    }
    walk(tree)
    return rows.filter((page) => page.isFavorite).map((page) => nodes.get(page.id)!)
  }, [rows, tree])

  return (
    <div className="sidebar-tones flex h-full flex-col bg-sidebar">
      {/* Clicking the empty space under the list closes the open page, the
          trash or the settings. Rows, and the menus they portal out of this
          element, bubble through here too, so only a click that landed on the
          space itself counts — and not one on the scrollbar, which Firefox
          reports as a click on the element it scrolls. */}
      <nav
        onClick={(event) => {
          if ((!openId && !view) || event.target !== event.currentTarget) return
          const bounds = event.currentTarget.getBoundingClientRect()
          if (event.clientX - bounds.left >= event.currentTarget.clientWidth) return
          onOpen(null)
        }}
        className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-[max(0.5rem,env(safe-area-inset-top))]"
      >
        <SectionLabel>Pages</SectionLabel>
        {tree.length === 0 ? (
          <p className="px-2 py-2 leading-relaxed text-faint">
            No pages yet. Create one to get started.
          </p>
        ) : (
          <PageTree
            nodes={tree}
            openId={openId}
            onOpen={onOpen}
            expanded={expanded}
            onToggleExpand={toggleExpanded}
          />
        )}
        <AddPage
          onClick={() => {
            raiseKeyboard()
            void createPage().then(onOpen)
          }}
        />

        {favourites.length > 0 && (
          <div className="mt-3">
            <SectionLabel>Favourites</SectionLabel>
            <PageTree
              nodes={favourites}
              openId={openId}
              onOpen={onOpen}
              expanded={expandedFavourites}
              onToggleExpand={toggleExpandedFavourite}
              draggable={false}
            />
          </div>
        )}
      </nav>

      <footer className="border-t border-line px-3 pt-[13px] pb-[max(13px,env(safe-area-inset-bottom))]">
        <SidebarAction
          icon="settings"
          label="Settings"
          current={view === 'settings'}
          onClick={() => onOpenView('settings')}
        />
        <SidebarAction
          icon="trash"
          label="Trash"
          current={view === 'trash'}
          onClick={() => onOpenView('trash')}
        />
      </footer>
    </div>
  )
}

function AddPage({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      // Lines up with the pages above it, the plus sitting where each page's
      // icon sits.
      className="my-px flex w-full items-center gap-1.5 rounded-md py-1 pl-1.5 pr-1 text-faint transition-colors hover:bg-[var(--hover)] hover:text-muted pointer-coarse:py-2"
    >
      <span className="grid size-5 shrink-0 place-items-center pointer-coarse:size-6">
        <Icon name="plus" size={15} strokeWidth={2} />
      </span>
      <span className="flex-1 text-left">Add new</span>
    </button>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 pb-1.5 pt-3 text-[11.5px] font-semibold uppercase tracking-wide text-faint pointer-coarse:text-[12.5px]">
      {children}
    </p>
  )
}

function SidebarAction({
  icon,
  label,
  current,
  onClick,
}: {
  icon: IconName
  label: string
  current: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={current ? 'page' : undefined}
      // Spaced as the page rows above are, the icon in the same slot.
      className={`my-px flex w-full items-center gap-1.5 rounded-md py-1 pl-1.5 pr-1 text-muted transition-colors pointer-coarse:py-2 ${
        current ? 'bg-[var(--selected)]' : 'hover:bg-[var(--hover)]'
      }`}
    >
      <span className="grid size-5 shrink-0 place-items-center pointer-coarse:size-6">
        <Icon name={icon} size={15} className="text-muted" />
      </span>
      <span className="flex-1 text-left">{label}</span>
    </button>
  )
}
