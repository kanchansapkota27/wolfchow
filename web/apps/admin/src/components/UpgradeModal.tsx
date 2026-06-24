import { useState } from 'react'
import { X, Lock, ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { sanitizeHtml } from '../lib/sanitize'

export interface UpgradeMessage {
  title: string
  html: string
}

interface Props {
  open: boolean
  onClose: () => void
  upgradeMessage?: UpgradeMessage
}

const DEFAULT_MESSAGE: UpgradeMessage = {
  title: 'Upgrade your plan',
  html: '<p>This feature is not available on your current plan. Upgrade to unlock advanced features and higher limits.</p>',
}

export function UpgradeModal({ open, onClose, upgradeMessage }: Props) {
  if (!open) return null

  const msg = upgradeMessage ?? DEFAULT_MESSAGE
  const safeHtml = sanitizeHtml(msg.html)

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-[420px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header band */}
        <div className="relative bg-gradient-to-br from-blue-600 to-blue-700 px-6 py-8 text-white">
          <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white">
            <X size={18} />
          </button>
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/20">
            <Lock size={22} className="text-white" />
          </div>
          <h2 className="text-xl font-bold">{msg.title}</h2>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          <div
            className="space-y-2 text-sm text-gray-600 [&_a]:text-blue-600 [&_a]:underline [&_li]:ml-4 [&_li]:list-disc [&_strong]:font-semibold [&_ul]:space-y-1"
            // sanitizeHtml strips all tags and attributes outside the safe allowlist
            dangerouslySetInnerHTML={{ __html: safeHtml }}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:border-gray-300">
            Maybe later
          </button>
          <Link
            to="/settings?section=plan"
            onClick={onClose}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            View plans
            <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </>
  )
}

/**
 * Wraps content with a lock overlay when `locked` is true.
 * Clicking anywhere on the locked area opens the upgrade modal.
 */
export function PlanLocked({ locked, children, upgradeMessage, label }: {
  locked: boolean
  children: React.ReactNode
  upgradeMessage?: UpgradeMessage
  label?: string
}) {
  const [open, setOpen] = useState(false)

  if (!locked) return <>{children}</>

  return (
    <>
      <div
        className="relative cursor-pointer select-none"
        onClick={() => setOpen(true)}
        title={label ?? 'Upgrade to unlock this feature'}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setOpen(true)}
      >
        <div className="pointer-events-none opacity-40">{children}</div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 shadow-sm">
            <Lock size={13} className="text-gray-500" />
            <span className="text-xs font-semibold text-gray-600">Upgrade to unlock</span>
          </div>
        </div>
      </div>
      <UpgradeModal open={open} onClose={() => setOpen(false)} upgradeMessage={upgradeMessage} />
    </>
  )
}

/**
 * Small inline lock icon for use next to nav items or labels.
 * Shows the upgrade modal on click.
 */
export function LockIcon({ upgradeMessage }: { upgradeMessage?: UpgradeMessage }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        className="inline-flex items-center justify-center rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-amber-500"
        title="Upgrade to unlock"
        tabIndex={0}
      >
        <Lock size={13} />
      </button>
      <UpgradeModal open={open} onClose={() => setOpen(false)} upgradeMessage={upgradeMessage} />
    </>
  )
}
