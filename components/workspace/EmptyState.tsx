import { Icon, type IconName } from '@/components/ui/Icon'

export function EmptyState({ icon = 'file', label = 'No page selected' }: { icon?: IconName; label?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 text-center">
      <div className="grid size-11 place-items-center rounded-xl border border-line bg-sunken text-faint">
        <Icon name={icon} size={20} />
      </div>
      <p className="text-faint">{label}</p>
    </div>
  )
}
