// Supabase Realtime subscription for the orders feed.
// When Slice 3 tablet routes are deployed, install @supabase/supabase-js
// and replace the no-op below with the real implementation.

export type OrderRealtimeEvent = {
  eventType: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  old: any
}

export function subscribeToOrders(
  _restaurantId: string,
  _handler: (event: OrderRealtimeEvent) => void,
): () => void {
  // TODO: replace with real Supabase subscription in Slice 3
  // import { createClient } from '@supabase/supabase-js'
  // const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  // const channel = client.channel(`orders:${_restaurantId}`)
  //   .on('postgres_changes', { event: '*', schema: 'public', table: 'orders',
  //       filter: `restaurant_id=eq.${_restaurantId}` }, _handler)
  //   .subscribe()
  // return () => void client.removeChannel(channel)
  return () => {}
}
