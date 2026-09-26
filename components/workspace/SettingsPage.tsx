'use client'

import { Icon } from '@/components/ui/Icon'
import { SyncStatusRow, useRetrySync } from './SyncControls'
import { useSyncStatus, useWorkspace } from './WorkspaceProvider'
import { setTheme, useTheme, type Theme } from '@/lib/util/theme'

const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

const built = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

/** Laid out like a note, as the trash is: the same title, then the settings
 *  where the body would be. */
export function SettingsPage() {
  const { session, signOut } = useWorkspace()
  const status = useSyncStatus()
  const retrySync = useRetrySync()

  return (
    <>
      <h1 className="page-title">Settings</h1>

      <SectionLabel>Account</SectionLabel>
      <div className="flex items-center gap-2 py-1 text-[length:var(--body-size)] text-ink">
        <Icon name="user" size={15} className="shrink-0 text-faint" />
        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{session?.user.email}</span>
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
          className="flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[13px] font-medium text-danger transition-colors hover:bg-[var(--hover)] pointer-coarse:py-2 pointer-coarse:text-[14px]"
        >
          <Icon name="logout" size={14} />
          Sign out
        </button>
      </div>

      <SectionLabel>Appearance</SectionLabel>
      <ThemeRow />

      <SectionLabel>Sync status</SectionLabel>
      <SyncStatusRow onRetry={() => void retrySync.startSync()} />
      {retrySync.overlay}

      {/* The build this device is running, which the service worker swaps for
          a new deploy's on a later load. */}
      <p className="mt-8 text-[12.5px] text-faint pointer-coarse:text-[13.5px]">
        Version {process.env.BUILD_COMMIT} · built {built.format(new Date(process.env.BUILD_TIME!))}
      </p>
    </>
  )
}

function ThemeRow() {
  const theme = useTheme()
  return (
    <div className="flex items-center gap-2 py-1 text-[length:var(--body-size)]">
      <span className="flex-1 text-ink">Theme</span>
      <div className="flex rounded-md border border-line p-px">
        {THEMES.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={theme === value}
            onClick={() => setTheme(value)}
            className={`rounded-[5px] px-2 py-0.5 text-[12.5px] font-medium transition-colors pointer-coarse:py-1 pointer-coarse:text-[13.5px] ${
              theme === value ? 'bg-[var(--selected)] text-ink' : 'text-muted hover:bg-[var(--hover)] hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-6 border-b border-line pb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-faint pointer-coarse:text-[12.5px]">
      {children}
    </p>
  )
}
