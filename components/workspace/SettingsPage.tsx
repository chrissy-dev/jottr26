'use client'

import { Icon } from '@/components/ui/Icon'
import { SyncStatusRow, useForceSync } from './SyncControls'
import { useSyncStatus, useWorkspace } from './WorkspaceProvider'

/** Laid out like a note, as the trash is: the same title, then the settings
 *  where the body would be. */
export function SettingsPage() {
  const { session, signOut } = useWorkspace()
  const status = useSyncStatus()
  const forceSync = useForceSync()

  return (
    <>
      <h1 className="page-title">Settings</h1>

      <SectionLabel>Account</SectionLabel>
      <p className="flex items-center gap-2 py-2 text-[length:var(--body-size)] text-ink">
        <Icon name="user" size={15} className="shrink-0 text-faint" />
        <span className="min-w-0 [overflow-wrap:anywhere]">{session?.user.email}</span>
      </p>

      <SectionLabel>Sync</SectionLabel>
      <SyncStatusRow onForceSync={() => void forceSync.startSync()} />
      {forceSync.overlay}

      <button
        type="button"
        onClick={() => {
          // Signing out erases the local copy, so unsynced work has to be
          // called out rather than quietly discarded.
          if (
            status.pending > 0 &&
            !window.confirm(
              `${status.pending} ${status.pending === 1 ? 'page has' : 'pages have'} changes that haven't reached your account yet. Signing out now will discard them. Continue?`,
            )
          ) {
            return
          }
          void signOut()
        }}
        className="mt-8 flex items-center gap-2 font-medium text-danger hover:underline pointer-coarse:py-2"
      >
        <Icon name="logout" size={15} />
        Sign out
      </button>
    </>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-6 border-b border-line pb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-faint pointer-coarse:text-[12.5px]">
      {children}
    </p>
  )
}
