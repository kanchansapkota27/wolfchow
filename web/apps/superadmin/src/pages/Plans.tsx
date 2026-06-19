import { useState } from 'react'
import type { Plan, PlanInput } from '@wolfchow/types'
import { Button, Modal } from '@wolfchow/ui'
import { useApi } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { SectionError } from '../components/SectionError'
import { PlanFormModal } from '../components/PlanFormModal'
import { FEATURE_FLAGS, PAYMENT_METHODS } from '../lib/planMeta'

/** `undefined` = modal closed; `null` = create; a Plan = edit that plan. */
type Editing = Plan | null | undefined

export function Plans() {
  const api = useApi()
  const { status, data, reload } = useAsync(() => api.superadmin.listPlans(), [api])
  const [editing, setEditing] = useState<Editing>(undefined)
  const [deleting, setDeleting] = useState<Plan | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  async function handleSubmit(input: PlanInput) {
    const target = editing
    if (target) await api.superadmin.updatePlan(target.id, input)
    else await api.superadmin.createPlan(input)
    reload()
  }

  async function confirmDelete() {
    if (!deleting) return
    setDeletingBusy(true)
    try {
      await api.superadmin.deletePlan(deleting.id)
      setDeleting(null)
      reload()
    } finally {
      setDeletingBusy(false)
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Plans</h1>
        <Button onClick={() => setEditing(null)}>Create plan</Button>
      </div>

      {status === 'loading' && <p className="text-gray-400">Loading plans…</p>}
      {status === 'error' && <SectionError onRetry={reload} />}

      {status === 'success' && data && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              onEdit={() => setEditing(plan)}
              onDelete={() => setDeleting(plan)}
            />
          ))}
        </div>
      )}

      <PlanFormModal
        open={editing !== undefined}
        initial={editing}
        onClose={() => setEditing(undefined)}
        onSubmit={handleSubmit}
      />

      <Modal open={deleting !== null} onClose={() => setDeleting(null)} title="Delete plan">
        <div className="text-gray-100">
          <p>
            Delete <strong>{deleting?.name}</strong>? This cannot be undone.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={deletingBusy} onClick={() => void confirmDelete()}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function PlanCard({
  plan,
  onEdit,
  onDelete,
}: {
  plan: Plan
  onEdit: () => void
  onDelete: () => void
}) {
  const inUse = (plan.restaurant_count ?? 0) > 0
  const enabledFlags = FEATURE_FLAGS.filter((f) => plan.feature_flags[f.key])
  const methods = PAYMENT_METHODS.filter((m) => plan.payment_methods_allowed.includes(m.value))

  return (
    <div className="flex flex-col rounded-lg border border-gray-800 bg-gray-900 p-5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{plan.name}</h2>
          {plan.public && (
            <span className="rounded bg-indigo-900 px-1.5 py-0.5 text-[10px] font-medium text-indigo-300">
              PUBLIC
            </span>
          )}
        </div>
        <span className="text-xs text-gray-400">{plan.restaurant_count ?? 0} restaurants</span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-300">
        <Stat label="Staff" value={plan.staff_cap} />
        <Stat label="Items" value={plan.item_cap} />
        <Stat label="Categories" value={plan.category_cap} />
        <Stat label="Modifiers" value={plan.modifier_cap} />
        <Stat label="SMTP/mo" value={plan.smtp_monthly_limit ?? 'Unlimited'} />
        <Stat label="History" value={plan.transaction_history_days ?? 'Unlimited'} />
        <Stat label="Commission" value={plan.commission_type === 'fixed' ? 'Fixed $' : '% of total'} />
      </dl>

      <div className="mt-3 flex flex-wrap gap-1">
        {methods.map((m) => (
          <span key={m.value} className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-300">
            {m.label}
          </span>
        ))}
      </div>

      <p className="mt-3 text-xs text-gray-400">
        {enabledFlags.length} feature{enabledFlags.length === 1 ? '' : 's'} enabled
      </p>

      <div className="mt-4 flex gap-2">
        <Button variant="secondary" onClick={onEdit}>
          Edit
        </Button>
        <span title={inUse ? `${plan.restaurant_count} restaurants on this plan` : undefined}>
          <Button variant="danger" disabled={inUse} onClick={onDelete}>
            Delete
          </Button>
        </span>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-gray-500">{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
