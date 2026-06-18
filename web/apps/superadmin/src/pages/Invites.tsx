import { useMemo, useState } from 'react'
import type { InviteStatus, InviteSummary } from '@wolfchow/types'
import { Badge, type BadgeVariant, Button, Modal } from '@wolfchow/ui'
import { formatDate } from '@wolfchow/utils'
import { useApi } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { SectionError } from '../components/SectionError'
import { GenerateInviteModal } from '../components/GenerateInviteModal'

const STATUS_BADGE: Record<InviteStatus, { variant: BadgeVariant; label: string }> = {
  pending: { variant: 'amber', label: 'Pending' },
  used: { variant: 'green', label: 'Used' },
  expired: { variant: 'red', label: 'Expired' },
  revoked: { variant: 'gray', label: 'Revoked' },
}

const FILTERS = ['all', 'pending', 'used', 'expired'] as const
type Filter = (typeof FILTERS)[number]

export function Invites() {
  const api = useApi()
  const { status, data, reload } = useAsync(async () => {
    const [invites, plans] = await Promise.all([
      api.superadmin.listInvites(),
      api.superadmin.listPlans(),
    ])
    return { invites: invites.invites, plans: plans.plans }
  }, [api])

  const [filter, setFilter] = useState<Filter>('all')
  const [genOpen, setGenOpen] = useState(false)
  const [revoking, setRevoking] = useState<InviteSummary | null>(null)
  const [revokeBusy, setRevokeBusy] = useState(false)

  const planName = useMemo(() => {
    const map = new Map<string, string>()
    for (const plan of data?.plans ?? []) map.set(plan.id, plan.name)
    return (id: string) => map.get(id) ?? '—'
  }, [data])

  const filtered = (data?.invites ?? []).filter((inv) =>
    filter === 'all' ? true : inv.status === filter,
  )

  async function confirmRevoke() {
    if (!revoking) return
    setRevokeBusy(true)
    try {
      await api.superadmin.revokeInvite(revoking.id)
      setRevoking(null)
      reload()
    } finally {
      setRevokeBusy(false)
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Invites</h1>
        <Button onClick={() => setGenOpen(true)}>Generate invite</Button>
      </div>

      <div className="mb-4 flex gap-2" role="tablist" aria-label="Invite status filter">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={[
              'rounded-md px-3 py-1.5 text-sm capitalize',
              filter === f ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800/60',
            ].join(' ')}
          >
            {f}
          </button>
        ))}
      </div>

      {status === 'loading' && <p className="text-gray-400">Loading invites…</p>}
      {status === 'error' && <SectionError onRetry={reload} />}

      {status === 'success' && (
        <div className="overflow-x-auto rounded-lg border border-gray-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-900 text-gray-400">
              <tr>
                <th className="px-4 py-2">Token</th>
                <th className="px-4 py-2">Plan</th>
                <th className="px-4 py-2">Commission</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Expires</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                    No invites
                  </td>
                </tr>
              ) : (
                filtered.map((inv) => {
                  const badge = STATUS_BADGE[inv.status]
                  return (
                    <tr key={inv.id} className="border-t border-gray-800">
                      <td className="px-4 py-2">
                        <code className="text-gray-300">{inv.token.slice(0, 12)}…</code>
                      </td>
                      <td className="px-4 py-2">{planName(inv.plan_id)}</td>
                      <td className="px-4 py-2">{+(inv.commission_rate * 100).toFixed(2)}%</td>
                      <td className="px-4 py-2 text-gray-400">{inv.email ?? '—'}</td>
                      <td className="px-4 py-2">
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </td>
                      <td className="px-4 py-2 text-gray-400">{formatDate(inv.expires_at, 'UTC')}</td>
                      <td className="px-4 py-2 text-right">
                        {inv.status === 'pending' && (
                          <Button variant="ghost" onClick={() => setRevoking(inv)}>
                            Revoke
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      <GenerateInviteModal
        open={genOpen}
        plans={data?.plans ?? []}
        onClose={() => {
          setGenOpen(false)
          reload()
        }}
        onCreate={(input) => api.superadmin.createInvite(input)}
      />

      <Modal open={revoking !== null} onClose={() => setRevoking(null)} title="Revoke invite">
        <div className="text-gray-100">
          <p>Revoke this invite? The link will stop working immediately.</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRevoking(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={revokeBusy} onClick={() => void confirmRevoke()}>
              Revoke
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
