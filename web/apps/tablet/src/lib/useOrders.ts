import { useCallback, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Order, OrderStatus } from '@wolfchow/types'
import { useApi } from './api'
import { useRealtime } from './realtime'

const ORDERS_QUERY_KEY = ['tablet-orders'] as const
const ACTIVE_STATUSES: OrderStatus[] = ['accepted', 'preparing', 'ready']

function playBeep() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.4, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
    osc.start()
    osc.stop(ctx.currentTime + 0.6)
  } catch {
    // AudioContext blocked until user interaction on some browsers
  }
}

export function useOrders() {
  const api = useApi()
  const queryClient = useQueryClient()
  const { subscribe } = useRealtime()
  const autoRejectTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const initialScheduleDone = useRef(false)

  const { data: orders = [], isLoading: loading } = useQuery({
    queryKey: ORDERS_QUERY_KEY,
    queryFn: () => api.orders.listActive(),
  })

  const setOrders = useCallback(
    (updater: (prev: Order[]) => Order[]) => {
      queryClient.setQueryData<Order[]>(ORDERS_QUERY_KEY, (prev) => updater(prev ?? []))
    },
    [queryClient],
  )

  const removeOrder = useCallback((orderId: string) => {
    setOrders((prev) => prev.filter((o) => o.id !== orderId))
    const timer = autoRejectTimers.current.get(orderId)
    if (timer) { clearTimeout(timer); autoRejectTimers.current.delete(orderId) }
  }, [setOrders])

  const scheduleAutoReject = useCallback((order: Order) => {
    if (!order.accept_deadline_at) return
    const ms = new Date(order.accept_deadline_at).getTime() - Date.now()
    if (ms <= 0) {
      void api.orders.rejectOrder(order.id, 'auto_reject').then(() => removeOrder(order.id)).catch(() => {})
      return
    }
    const timer = setTimeout(() => {
      void api.orders.rejectOrder(order.id, 'auto_reject').then(() => removeOrder(order.id)).catch(() => {})
    }, ms)
    autoRejectTimers.current.set(order.id, timer)
  }, [api, removeOrder])

  // Schedule auto-reject timers once, right after the initial fetch resolves
  // (matches the old effect's [api, scheduleAutoReject]-once-on-mount behavior;
  // guarded by a ref so later cache updates from realtime/mutations don't re-run it).
  useEffect(() => {
    if (initialScheduleDone.current || loading) return
    initialScheduleDone.current = true
    orders.filter((o) => o.status === 'auth_success').forEach(scheduleAutoReject)
  }, [loading, orders, scheduleAutoReject])

  useEffect(() => {
    const timers = autoRejectTimers.current
    return () => { timers.forEach(clearTimeout); timers.clear() }
  }, [])

  useEffect(() => {
    const unsubs = [
      subscribe('new_order', (_, payload) => {
        const orderId = payload.order_id as string
        void api.orders.getOrder(orderId).then((order) => {
          setOrders((prev) => {
            if (prev.some((o) => o.id === orderId)) return prev
            return [order, ...prev]
          })
          scheduleAutoReject(order)
          playBeep()
        }).catch(() => {})
      }),

      subscribe('order_accepted', (_, payload) => {
        const orderId = payload.order_id as string
        setOrders((prev) =>
          prev.map((o) => o.id === orderId ? { ...o, status: 'accepted' as OrderStatus } : o),
        )
        const timer = autoRejectTimers.current.get(orderId)
        if (timer) { clearTimeout(timer); autoRejectTimers.current.delete(orderId) }
      }),

      subscribe('order_rejected', (_, payload) => {
        removeOrder(payload.order_id as string)
      }),

      subscribe('order_status_changed', (_, payload) => {
        const { order_id, new_status } = payload as { order_id: string; new_status: string }
        setOrders((prev) =>
          prev.map((o) => o.id === order_id ? { ...o, status: new_status as OrderStatus } : o),
        )
      }),
    ]
    return () => unsubs.forEach((u) => u())
  }, [subscribe, api, scheduleAutoReject, removeOrder, setOrders])

  const newOrders = orders.filter((o) => o.status === 'auth_success')
  const activeOrders = orders.filter((o) => ACTIVE_STATUSES.includes(o.status))

  const acceptMutation = useMutation({
    mutationFn: (orderId: string) => api.orders.acceptOrder(orderId),
    onSuccess: (updated, orderId) => {
      setOrders((prev) => prev.map((o) => o.id === orderId ? updated : o))
      const timer = autoRejectTimers.current.get(orderId)
      if (timer) { clearTimeout(timer); autoRejectTimers.current.delete(orderId) }
    },
  })
  const accept = useCallback(async (orderId: string) => {
    await acceptMutation.mutateAsync(orderId)
  }, [acceptMutation])

  const rejectMutation = useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason?: string }) =>
      api.orders.rejectOrder(orderId, reason),
    onSuccess: (_data, { orderId }) => removeOrder(orderId),
  })
  const reject = useCallback(async (orderId: string, reason?: string) => {
    await rejectMutation.mutateAsync({ orderId, reason })
  }, [rejectMutation])

  const updateStatusMutation = useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: string }) =>
      api.orders.updateOrderStatus(orderId, status),
    onSuccess: (updated, { orderId }) => {
      setOrders((prev) => prev.map((o) => o.id === orderId ? updated : o))
    },
  })
  const updateStatus = useCallback(async (orderId: string, status: string) => {
    return updateStatusMutation.mutateAsync({ orderId, status })
  }, [updateStatusMutation])

  return { newOrders, activeOrders, loading, accept, reject, updateStatus }
}
