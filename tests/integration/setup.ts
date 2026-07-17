import WebSocket from 'ws'

// @supabase/supabase-js's realtime client requires a native WebSocket
// constructor. Node 20 (CI's runtime) doesn't have one; Node 22+ does. Only
// polyfill when missing so this stays a no-op on newer local Node versions.
if (typeof globalThis.WebSocket === 'undefined') {
  // @ts-expect-error ws's constructor shape doesn't exactly match lib.dom's WebSocket type
  globalThis.WebSocket = WebSocket
}
