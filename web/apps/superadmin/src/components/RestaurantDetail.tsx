import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Plan, Restaurant, RestaurantUpdate } from '@wolfchow/types'
import { Badge, Button, Modal } from '@wolfchow/ui'
import { formatDate } from '@wolfchow/utils'
import { ADMIN_URL, useApi } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { SectionError } from './SectionError'
import { InlineEdit } from './InlineEdit'

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
  const { status, data, reload } = useAsync(
    () => api.superadmin.getRestaurant(restaurantId),
    [restaurantId],
  )
  const [tab, setTab] = useState<Tab>('overview')
  const [local, setLocal] = useState<Restaurant | null>(null)
  const [confirm, setConfirm] = useState<null | 'suspend' | 'reactivate'>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (data) setLocal(data)
  }, [data])

  async function patch(update: RestaurantUpdate) {
    const res = await api.superadmin.updateRestaurant(restaurantId, update)
    setLocal((cur) => (cur ? ({ ...cur, ...res } as Restaurant) : cur))
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
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  function impersonate() {
    void api.superadmin.impersonate(restaurantId).then((res) => {
      window.open(
        `${ADMIN_URL}/?access_token=${encodeURIComponent(res.access_token)}`,
        '_blank',
        'noopener',
      )
    })
  }

  const r = local

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
        className="h-full w-[480px] max-w-full overflow-y-auto border-l border-gray-800 bg-gray-900 p-6 text-gray-100"
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
          <button type="button" aria-label="Close" onClick={onClose} className="text-gray-400 hover:text-gray-100">
            ✕
          </button>
        </div>

        {status === 'loading' && <p className="text-gray-400">Loading…</p>}
        {status === 'error' && <SectionError onRetry={reload} />}

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
                    tab === t ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800/60',
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
                  <code className="text-gray-300">{r.slug}</code>
                </Row>
                <Row label="Timezone">{r.timezone}</Row>
                <Row label="Currency">{r.currency}</Row>
                <Row label="Plan">
                  <select
                    aria-label="Plan"
                    value={r.plan_id ?? ''}
                    onChange={(e) => void patch({ plan_id: e.target.value })}
                    className="rounded-md border border-gray-700 bg-gray-800 px-2 py-1"
                  >
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Row>
                <Row label="Commission">
                  <InlineEdit
                    ariaLabel="Commission rate percent"
                    type="number"
                    value={String(+(r.commission_rate * 100).toFixed(2))}
                    onSave={(v) => patch({ commission_rate: (Number(v) || 0) / 100 })}
                  />
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

            <div className="mt-6 flex flex-wrap gap-2 border-t border-gray-800 pt-4">
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
            </div>
          </>
        )}

        <Modal
          open={confirm !== null}
          onClose={() => setConfirm(null)}
          title={confirm === 'suspend' ? 'Suspend restaurant' : 'Reactivate restaurant'}
        >
          <div className="text-gray-100">
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
