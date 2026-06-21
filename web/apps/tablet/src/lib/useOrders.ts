import { useCallback, useEffect, useRef, useState } from 'react'
import type { Order, OrderStatus } from '@wolfchow/types'
import { useApi } from './api'
import { useRealtime } from './realtime'

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

const ACTIVE_STATUSES: OrderStatus[] = ['accepted', 'preparing', 'ready']

export function useOrders() {
  const api = useApi()
  const { subscribe } = useRealtime()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const autoRejectTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const removeOrder = useCallback((orderId: string) => {
    setOrders((prev) => prev.filter((o) => o.id !== orderId))
    const timer = autoRejectTimers.current.get(orderId)
    if (timer) { clearTimeout(timer); autoRejectTimers.current.delete(orderId) }
  }, [])

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

  useEffect(() => {
    void api.orders.listActive().then((list) => {
      setOrders(list)
      list.filter((o) => o.status === 'auth_success').forEach(scheduleAutoReject)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [api, scheduleAutoReject])

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
  }, [subscribe, api, scheduleAutoReject, removeOrder])

  const newOrders = orders.filter((o) => o.status === 'auth_success')
  const activeOrders = orders.filter((o) => ACTIVE_STATUSES.includes(o.status))

  const accept = useCallback(async (orderId: string) => {
    const updated = await api.orders.acceptOrder(orderId)
    setOrders((prev) => prev.map((o) => o.id === orderId ? updated : o))
    const timer = autoRejectTimers.current.get(orderId)
    if (timer) { clearTimeout(timer); autoRejectTimers.current.delete(orderId) }
  }, [api])

  const reject = useCallback(async (orderId: string, reason?: string) => {
    await api.orders.rejectOrder(orderId, reason)
    removeOrder(orderId)
  }, [api, removeOrder])

  const updateStatus = useCallback(async (orderId: string, status: string) => {
    const updated = await api.orders.updateOrderStatus(orderId, status)
    setOrders((prev) => prev.map((o) => o.id === orderId ? updated : o))
    return updated
  }, [api])

  return { newOrders, activeOrders, loading, accept, reject, updateStatus }
}
