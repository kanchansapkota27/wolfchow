/**
 * A device is considered online if it's sent a heartbeat within this window.
 * The tablet app heartbeats every 5 minutes (web/apps/tablet/src/components/Layout.tsx),
 * so 10 minutes gives a full missed-beat's grace before flagging it offline.
 */
export const DEVICE_ONLINE_THRESHOLD_MS = 10 * 60 * 1000

export function isDeviceOnline(lastSeenAt: string | null, now: number = Date.now()): boolean {
  if (!lastSeenAt) return false
  return now - new Date(lastSeenAt).getTime() < DEVICE_ONLINE_THRESHOLD_MS
}
