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

/** The build as YYYYMMDDHHMM, in this device's time, so a later deploy is
 *  always the bigger number. */
function buildStamp() {
  const at = new Date(process.env.BUILD_TIME!)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}${pad(at.getHours())}${pad(at.getMinutes())}`
}

/** The row the trail takes on a page: on the left the build this device is
 *  running, which the service worker swaps for a new deploy's on a later load,
 *  in the same size and colour as the trail's last crumb; on the right the
 *  button to sign out, where the trash keeps its Empty trash. */
export function SettingsBar() {
  const { signOut } = useWorkspace()
  const status = useSyncStatus()
  return (
    <>
      <span className="flex h-8 items-center text-faint pointer-coarse:h-10">Version {buildStamp()}</span>
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
        className="pointer-events-auto ml-auto flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-sunken px-3 font-medium text-danger shadow-[var(--shadow-subtle)] transition-colors hover:bg-[var(--hover)] pointer-coarse:h-10"
      >
        <Icon name="logout" size={14} />
        Sign out
      </button>
    </>
  )
}

/** Laid out like a note, as the trash is: the same title, then the settings
 *  where the body would be. */
export function SettingsPage() {
  const { session } = useWorkspace()
  const retrySync = useRetrySync()

  return (
    <>
      <h1 className="page-title">Settings</h1>

      <SectionLabel>Account</SectionLabel>
      <div className="flex items-center gap-2 py-1 text-[length:var(--body-size)] text-ink">
        <Icon name="user" size={15} className="shrink-0 text-faint" />
        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{session?.user.email}</span>
      </div>

      <SectionLabel>Appearance</SectionLabel>
      <ThemeRow />

      <SectionLabel>Sync status</SectionLabel>
      <SyncStatusRow onRetry={() => void retrySync.startSync()} />
      {retrySync.overlay}
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
