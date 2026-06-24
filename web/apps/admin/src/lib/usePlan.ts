import { useQuery } from '@tanstack/react-query'
import type { Plan } from '@wolfchow/types'
import { useApi } from './api'

export interface PlanData {
  plan: Plan
  usage: { categories: number; items: number; staff: number; modifiers: number }
  upgrade_message: { title: string; html: string }
}

const DEFAULT_UPGRADE_MESSAGE = {
  title: 'Upgrade your plan',
  html: '<p>This feature is not available on your current plan. Upgrade to unlock advanced features and higher limits.</p>',
}

export function usePlan() {
  const api = useApi()
  const { data, isLoading } = useQuery({
    queryKey: ['admin-plan'],
    queryFn: () => api.admin.getPlan().catch(() => null),
    staleTime: 5 * 60_000,
    retry: false,
  })

  return {
    plan: data?.plan ?? null,
    usage: data?.usage ?? null,
    upgradeMessage: data?.upgrade_message ?? DEFAULT_UPGRADE_MESSAGE,
    isLoading,
  }
}
