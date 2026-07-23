import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321'
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

export function createSupabaseAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL || LOCAL_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || LOCAL_SERVICE_ROLE_KEY
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export const BACKEND_URL = process.env.E2E_BACKEND_URL || 'http://localhost:8789'
