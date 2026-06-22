import { useState } from 'react'
import type { Plan, PlanInput } from '@wolfchow/types'
import { Button, Modal } from '@wolfchow/ui'
import { Pencil, Trash2, Plus, Users, ShoppingBag, List, Layers, Mail, Clock } from 'lucide-react'
import { useApi } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { SectionError } from '../components/SectionError'
import { PlanFormModal } from '../components/PlanFormModal'
import { FEATURE_FLAGS, PAYMENT_METHODS } from '../lib/planMeta'
import { PageHeader } from '../components/PageHeader'

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
      <PageHeader
        title="Subscription Plans"
        subtitle="Configure platform tiers and feature limits for all tenants."
        action={
          <button
            type="button"
            onClick={() => setEditing(null)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus size={16} />
            Create Plan
          </button>
        }
      />

      {status === 'loading' && (
        <p className="text-sm text-gray-500">Loading plans…</p>
      )}
      {status === 'error' && <SectionError onRetry={reload} />}

      {status === 'success' && data && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
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
        <div>
          <p className="text-gray-700">
            Delete <strong>{deleting?.name}</strong>? This cannot be undone.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="danger" loading={deletingBusy} onClick={() => void confirmDelete()}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function PlanCard({ plan, onEdit, onDelete }: { plan: Plan; onEdit: () => void; onDelete: () => void }) {
  const inUse = (plan.restaurant_count ?? 0) > 0
  const enabledFlags = FEATURE_FLAGS.filter((f) => plan.feature_flags[f.key])
  const methods = PAYMENT_METHODS.filter((m) => plan.payment_methods_allowed.includes(m.value))

  const capValue = (v: number | null | undefined) =>
    v === null || v === undefined ? '∞' : v >= 9999 ? '∞' : String(v)

  return (
    <div className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">{plan.name}</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            {plan.restaurant_count ?? 0} active restaurant{plan.restaurant_count === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Edit plan"
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={inUse}
            title={inUse ? `${plan.restaurant_count} restaurants on this plan` : undefined}
            className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Delete plan"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* Capability grid */}
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
        {[
          { icon: Users, label: 'STAFF CAP', value: capValue(plan.staff_cap) },
          { icon: ShoppingBag, label: 'ITEM CAP', value: capValue(plan.item_cap) },
          { icon: List, label: 'CATEGORY CAP', value: capValue(plan.category_cap) },
          { icon: Layers, label: 'MODIFIER CAP', value: capValue(plan.modifier_cap) },
          { icon: Mail, label: 'SMTP LIMIT', value: capValue(plan.smtp_monthly_limit) },
          { icon: Clock, label: 'HISTORY (DAYS)', value: capValue(plan.transaction_history_days) },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label}>
            <p className="flex items-center gap-1 text-[10px] font-semibold tracking-wider text-gray-400 uppercase">
              <Icon size={11} />
              {label}
            </p>
            <p className="mt-0.5 text-base font-bold text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      {/* Feature flags */}
      {enabledFlags.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[10px] font-semibold tracking-wider text-gray-400 uppercase">Feature Flags</p>
          <div className="flex flex-wrap gap-1.5">
            {enabledFlags.map((f) => (
              <span key={f.key} className="rounded-md bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 border border-green-200">
                {f.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Payment methods */}
      {methods.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[10px] font-semibold tracking-wider text-gray-400 uppercase">Allowed Payments</p>
          <div className="flex flex-wrap gap-1.5">
            {methods.map((m) => (
              <span key={m.value} className="rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-600">
                {m.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
