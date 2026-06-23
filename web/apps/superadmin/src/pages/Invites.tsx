import { useMemo, useState } from 'react'
import type { InviteStatus, InviteSummary } from '@wolfchow/types'
import { Badge, type BadgeVariant, Button, Modal } from '@wolfchow/ui'
import { formatDate } from '@wolfchow/utils'
import { Plus, Filter, Copy } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi } from '../lib/api'
import { SectionError } from '../components/SectionError'
import { GenerateInviteModal } from '../components/GenerateInviteModal'
import { PageHeader } from '../components/PageHeader'

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
  const queryClient = useQueryClient()
  const { status, data, refetch } = useQuery({
    queryKey: ['invites'],
    queryFn: async () => {
      const [invites, plans] = await Promise.all([
        api.superadmin.listInvites(),
        api.superadmin.listPlans(),
      ])
      return { invites: invites.invites, plans: plans.plans }
    },
  })

  const [statusDropdown, setStatusDropdown] = useState('all')
  const [search, setSearch] = useState('')
  const [genOpen, setGenOpen] = useState(false)
  const [revoking, setRevoking] = useState<InviteSummary | null>(null)
  const [revokeBusy, setRevokeBusy] = useState(false)

  const planName = useMemo(() => {
    const map = new Map<string, string>()
    for (const plan of data?.plans ?? []) map.set(plan.id, plan.name)
    return (id: string) => map.get(id) ?? '—'
  }, [data])

  const filtered = (data?.invites ?? []).filter((inv) => {
    const matchStatus = statusDropdown === 'all' ? true : inv.status === statusDropdown
    const matchSearch = search
      ? inv.token.toLowerCase().includes(search.toLowerCase()) ||
        (inv.email ?? '').toLowerCase().includes(search.toLowerCase())
      : true
    return matchStatus && matchSearch
  })

  async function confirmRevoke() {
    if (!revoking) return
    setRevokeBusy(true)
    try {
      await api.superadmin.revokeInvite(revoking.id)
      setRevoking(null)
      await queryClient.invalidateQueries({ queryKey: ['invites'] })
    } finally {
      setRevokeBusy(false)
    }
  }

  function copyToken(token: string) {
    void navigator.clipboard.writeText(token)
  }

  return (
    <div>
      <PageHeader
        title="Restaurant Invites"
        subtitle="Issue and track private signup tokens for new restaurants."
        action={
          <button
            type="button"
            onClick={() => setGenOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus size={16} />
            Generate Invite
          </button>
        }
      />

      {/* Search + filter */}
      <div className="mb-4 flex gap-3 rounded-xl border border-gray-200 bg-white p-3">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search by token or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none"
          />
          <svg className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <div className="flex items-center gap-2">
          <Filter size={15} className="text-gray-400" />
          <select
            aria-label="Filter by status"
            value={statusDropdown}
            onChange={(e) => setStatusDropdown(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
          >
            <option value="all">All Status</option>
            {FILTERS.filter((f) => f !== 'all').map((f) => (
              <option key={f} value={f} className="capitalize">{f.charAt(0).toUpperCase() + f.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>

      {status === 'pending' && <p className="text-sm text-gray-500">Loading invites…</p>}
      {status === 'error' && <SectionError onRetry={() => void refetch()} />}

      {status === 'success' && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Token</th>
                  <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Plan</th>
                  <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Commission</th>
                  <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Email (Pre-assign)</th>
                  <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Expires</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">
                      No invites found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((inv) => {
                    const badge = STATUS_BADGE[inv.status]
                    return (
                      <tr key={inv.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-blue-600">
                            {inv.token.slice(0, 12)}…
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-900">{planName(inv.plan_id)}</td>
                        <td className="px-4 py-3 text-gray-600">{+(inv.commission_rate * 100).toFixed(2)}%</td>
                        <td className="px-4 py-3 text-gray-400 italic">{inv.email ?? 'Anyone'}</td>
                        <td className="px-4 py-3">
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                        </td>
                        <td className="px-4 py-3 text-gray-500">{formatDate(inv.expires_at, 'UTC')}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              title="Copy token"
                              onClick={() => copyToken(inv.token)}
                              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                            >
                              <Copy size={14} />
                            </button>
                            {inv.status === 'pending' && (
                              <Button variant="ghost" onClick={() => setRevoking(inv)}>
                                Revoke
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <GenerateInviteModal
        open={genOpen}
        plans={data?.plans ?? []}
        onClose={() => { setGenOpen(false); void queryClient.invalidateQueries({ queryKey: ['invites'] }) }}
        onCreate={(input) => api.superadmin.createInvite(input)}
      />

      <Modal open={revoking !== null} onClose={() => setRevoking(null)} title="Revoke invite">
        <div>
          <p className="text-gray-700">Revoke this invite? The link will stop working immediately.</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRevoking(null)}>Cancel</Button>
            <Button variant="danger" loading={revokeBusy} onClick={() => void confirmRevoke()}>
              Revoke
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
