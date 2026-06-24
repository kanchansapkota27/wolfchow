import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Plan, Restaurant, RestaurantUpdate } from '@wolfchow/types'
import { Badge, Button, Input, Modal } from '@wolfchow/ui'
import { formatDate } from '@wolfchow/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ADMIN_URL, useApi } from '../lib/api'
import { SectionError } from './SectionError'
import { InlineEdit } from './InlineEdit'
import { CreateOwnerModal } from './CreateOwnerModal'

type Tab = 'overview' | 'limits' | 'smtp'

interface RestaurantDetailProps {
  restaurantId: string
  plans: Plan[]
  onClose: () => void
  /** Called after any change so the list can refresh. */
  onChanged: () => void
}

/** Right-side detail panel for a single restaurant. */
export function RestaurantDetail({ restaurantId, plans, onClose, onChanged }: RestaurantDetailProps) {
  const api = useApi()
  const queryClient = useQueryClient()
  const { status, data } = useQuery({
    queryKey: ['restaurant', restaurantId],
    queryFn: () => api.superadmin.getRestaurant(restaurantId),
  })
  const [tab, setTab] = useState<Tab>('overview')
  const [local, setLocal] = useState<Restaurant | null>(null)
  const [confirm, setConfirm] = useState<null | 'suspend' | 'reactivate'>(null)
  const [pendingPlan, setPendingPlan] = useState<string | null>(null)
  const [createOwnerOpen, setCreateOwnerOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (data) setLocal(data)
  }, [data])

  async function patch(update: RestaurantUpdate) {
    const res = await api.superadmin.updateRestaurant(restaurantId, update)
    setLocal((cur) => (cur ? ({ ...cur, ...res } as Restaurant) : cur))
    await queryClient.invalidateQueries({ queryKey: ['restaurant', restaurantId] })
    onChanged()
  }

  async function setActive(next: boolean) {
    setBusy(true)
    try {
      const res = next
        ? await api.superadmin.reactivateRestaurant(restaurantId)
        : await api.superadmin.suspendRestaurant(restaurantId)
      setLocal((cur) => (cur ? { ...cur, active: res.active } : cur))
      setConfirm(null)
      await queryClient.invalidateQueries({ queryKey: ['restaurant', restaurantId] })
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  async function confirmPlanChange() {
    if (!pendingPlan) return
    setBusy(true)
    try {
      await patch({ plan_id: pendingPlan })
      setPendingPlan(null)
    } finally {
      setBusy(false)
    }
  }

  function impersonate() {
    void api.superadmin.impersonate(restaurantId).then((res) => {
      // Never put the token in the URL (it would leak via server logs, Referer,
      // and history). Open the admin app with no token, then hand the
      // short-lived token to it via postMessage — scoped to the exact admin
      // origin — once it signals it's ready. (Can't use `noopener` here: we need
      // the window handle to post to it; the origin check is the guard.)
      const adminOrigin = new URL(ADMIN_URL).origin
      const popup = window.open(ADMIN_URL, '_blank')
      if (!popup) return

      const onMessage = (event: MessageEvent) => {
        if (event.origin !== adminOrigin || event.data !== 'impersonation:ready') return
        popup.postMessage(
          { type: 'impersonation:token', access_token: res.access_token },
          adminOrigin,
        )
        window.removeEventListener('message', onMessage)
      }
      window.addEventListener('message', onMessage)
      // Don't leak the listener if the admin app never signals readiness.
      setTimeout(() => window.removeEventListener('message', onMessage), 30_000)
    })
  }

  const r = local
  const pendingPlanName = plans.find((p) => p.id === pendingPlan)?.name ?? '—'

  return (
    <div
      className="fixed inset-0 z-30 flex justify-end bg-black/50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <aside
        role="dialog"
        aria-label={`Restaurant ${r?.display_name ?? ''}`}
        className="h-full w-[480px] max-w-full overflow-y-auto border-l border-gray-200 bg-white p-6 text-gray-900"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold">{r?.display_name ?? '…'}</h2>
            {r && (
              <span className="mt-1 inline-block">
                <Badge variant={r.active ? 'green' : 'red'}>{r.active ? 'Active' : 'Suspended'}</Badge>
              </span>
            )}
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="text-gray-400 hover:text-gray-700">
            ✕
          </button>
        </div>

        {status === 'pending' && <p className="text-gray-400">Loading…</p>}
        {status === 'error' && <SectionError onRetry={() => void queryClient.invalidateQueries({ queryKey: ['restaurant', restaurantId] })} />}

        {status === 'success' && r && (
          <>
            <div className="mb-4 flex gap-2" role="tablist" aria-label="Restaurant detail tabs">
              {(['overview', 'limits', 'smtp'] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={[
                    'rounded-md px-3 py-1.5 text-sm capitalize',
                    tab === t ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-500 hover:bg-gray-100',
                  ].join(' ')}
                >
                  {t === 'smtp' ? 'SMTP' : t}
                </button>
              ))}
            </div>

            {tab === 'overview' && (
              <dl className="space-y-3 text-sm">
                <Row label="Display name">{r.display_name}</Row>
                <Row label="Business name">{r.business_name}</Row>
                <Row label="Slug">
                  <code className="text-gray-600">{r.slug}</code>
                </Row>
                <Row label="Timezone">{r.timezone}</Row>
                <Row label="Currency">{r.currency}</Row>
                <Row label="Plan">
                  <select
                    aria-label="Plan"
                    value={r.plan_id ?? ''}
                    onChange={(e) => setPendingPlan(e.target.value)}
                    className="rounded-md border border-gray-200 bg-white px-2 py-1 text-gray-900 focus:border-blue-500 focus:outline-none"
                  >
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Row>
                <Row label="Commission override">
                  {r.override_commission_value !== null ? (
                    <span className="text-xs text-amber-400">
                      {r.override_commission_type === 'fixed'
                        ? `$${(r.override_commission_value / 100).toFixed(2)}/mo`
                        : `${(r.override_commission_value / 100).toFixed(2)}% of sales`}
                      {' '}
                      <button
                        type="button"
                        className="text-gray-500 hover:text-red-400"
                        onClick={() => void patch({ override_commission_type: null, override_commission_value: null })}
                      >
                        (remove)
                      </button>
                    </span>
                  ) : (
                    <span className="text-xs text-gray-500">Inherited from plan</span>
                  )}
                </Row>
                <Row label="Billing note">
                  <InlineEdit
                    ariaLabel="Billing note"
                    value={r.billing_note ?? ''}
                    placeholder="Add a note"
                    onSave={(v) => patch({ billing_note: v.trim() || null })}
                  />
                </Row>
                <Row label="Created">{formatDate(r.created_at, 'UTC')}</Row>
              </dl>
            )}

            {tab === 'limits' && (
              <LimitsTab plan={plans.find((p) => p.id === r.plan_id) ?? null} />
            )}

            {tab === 'smtp' && (
              <p className="text-sm text-gray-400">
                Per-restaurant SMTP overrides are managed in the SMTP section.
              </p>
            )}

            <div className="mt-6 flex flex-wrap gap-2 border-t border-gray-200 pt-4">
              {r.active ? (
                <Button variant="danger" onClick={() => setConfirm('suspend')}>
                  Suspend
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => setConfirm('reactivate')}>
                  Reactivate
                </Button>
              )}
              <Button variant="ghost" onClick={impersonate}>
                View as admin
              </Button>
              <Button variant="ghost" onClick={() => setCreateOwnerOpen(true)}>
                Create owner
              </Button>
            </div>
          </>
        )}

        <CreateOwnerModal
          open={createOwnerOpen}
          restaurantId={restaurantId}
          restaurantName={r?.display_name ?? ''}
          onClose={() => setCreateOwnerOpen(false)}
        />

        {/* Suspend / reactivate confirmation */}
        <Modal
          open={confirm !== null}
          onClose={() => setConfirm(null)}
          title={confirm === 'suspend' ? 'Suspend restaurant' : 'Reactivate restaurant'}
        >
          <div className="text-gray-700">
            <p>
              {confirm === 'suspend'
                ? `Suspend ${r?.display_name}? This will disable their widget and admin panel.`
                : `Reactivate ${r?.display_name}?`}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant={confirm === 'suspend' ? 'danger' : 'primary'}
                loading={busy}
                onClick={() => void setActive(confirm === 'reactivate')}
              >
                {confirm === 'suspend' ? 'Suspend' : 'Reactivate'}
              </Button>
            </div>
          </div>
        </Modal>

        {/* Plan change confirmation */}
        <Modal
          open={pendingPlan !== null}
          onClose={() => setPendingPlan(null)}
          title="Change plan"
        >
          <div className="text-gray-700">
            <p>
              Change <strong>{r?.display_name}</strong> to plan{' '}
              <strong>{pendingPlanName}</strong>? This will affect billing and feature limits immediately.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPendingPlan(null)}>
                Cancel
              </Button>
              <Button loading={busy} onClick={() => void confirmPlanChange()}>
                Change plan
              </Button>
            </div>
          </div>
        </Modal>
      </aside>
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  )
}

function LimitsTab({ plan }: { plan: Plan | null }) {
  if (!plan) return <p className="text-sm text-gray-400">No plan assigned.</p>
  const caps: Array<[string, number | string]> = [
    ['Staff', plan.staff_cap],
    ['Items', plan.item_cap],
    ['Categories', plan.category_cap],
    ['Modifiers', plan.modifier_cap],
    ['SMTP/mo', plan.smtp_monthly_limit ?? 'Unlimited'],
    ['History (days)', plan.transaction_history_days ?? 'Unlimited'],
  ]
  return (
    <div>
      <p className="mb-2 text-sm text-gray-400">Plan defaults ({plan.name}):</p>
      <dl className="space-y-2 text-sm">
        {caps.map(([label, value]) => (
          <div key={label} className="flex justify-between">
            <dt className="text-gray-500">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-gray-500">Per-restaurant cap overrides are not yet supported.</p>
    </div>
  )
}
