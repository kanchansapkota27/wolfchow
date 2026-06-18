/**
 * STORY-005 · Superadmin & support provisioning.
 *
 * Creates the platform's superadmin and support users directly via the Supabase
 * Auth admin API (NOT the public signup endpoint) and their corresponding
 * `public.users` rows so the custom_access_token_hook injects the right claims:
 *   superadmin → { role: 'superadmin', restaurant_id: null, permissions: [] }
 *   support    → { role: 'support',    restaurant_id: null, permissions: [] }
 *
 * Idempotent: re-running updates the existing users' role rows instead of
 * failing on a duplicate. The support user is optional — omit it to provision
 * the superadmin alone.
 *
 * Each setting resolves from the environment first, then the `LOCAL` fallback
 * block below, else throws. The local Supabase URL/key are pre-filled there, so
 * locally you only need to supply the credentials:
 *
 *   SUPERADMIN_EMAIL=admin@example.com SUPERADMIN_PASSWORD=... \
 *   [SUPPORT_EMAIL=support@example.com SUPPORT_PASSWORD=...] \
 *   npx tsx scripts/seed-superadmin.ts
 *
 * In production, pass every value via the environment (never rely on LOCAL).
 *
 * --- TOTP (MFA) enrollment ---
 * `requireMFA` gates every /superadmin/* route on a `totp` factor in the JWT
 * `amr`. Password creation here does NOT enrol MFA; each platform user enrols
 * their authenticator the first time they sign in, via Supabase Auth client MFA:
 *   1. supabase.auth.mfa.enroll({ factorType: 'totp' }) → returns a QR/secret
 *   2. user scans it in their authenticator app
 *   3. supabase.auth.mfa.challenge + verify with the 6-digit code
 * After verification the session reaches AAL2 and subsequent access tokens carry
 * `amr: [..., { method: 'totp' }]`, satisfying `requireMFA`.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

interface SeedUser {
  email: string
  password: string
  role: 'superadmin' | 'support'
}

/**
 * In-script fallbacks for local convenience. Environment variables ALWAYS take
 * precedence; these are only used when the matching env var is unset.
 *
 * Pre-filled with the NON-SECRET local Supabase values (the demo service-role
 * key is public — same on every local install, also in .dev.vars.example).
 * Leave the email/password BLANK and pass them via env, or fill them only in
 * your local working copy. Do NOT commit real keys or passwords here.
 */
const LOCAL: Record<string, string> = {
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_SERVICE_ROLE_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
  SUPERADMIN_EMAIL: '',
  SUPERADMIN_PASSWORD: '',
  SUPPORT_EMAIL: '',
  SUPPORT_PASSWORD: '',
}

/** Env first, then the LOCAL fallback; throws if neither is set. */
function resolve(name: string): string {
  const value = process.env[name] || LOCAL[name]
  if (!value) {
    throw new Error(
      `Missing ${name}: set the ${name} env var or fill LOCAL.${name} in scripts/seed-superadmin.ts`,
    )
  }
  return value
}

/** Env first, then the LOCAL fallback; undefined if neither is set. */
function optional(name: string): string | undefined {
  return process.env[name] || LOCAL[name] || undefined
}

/** Find an existing auth user by email (admin API has no direct get-by-email). */
async function findAuthUserId(admin: SupabaseClient, email: string): Promise<string | null> {
  let page = 1
  // Pages are bounded; the platform has a handful of admin users.
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (match) return match.id
    if (data.users.length < 200) return null
    page += 1
  }
}

async function provision(admin: SupabaseClient, user: SeedUser): Promise<void> {
  let userId = await findAuthUserId(admin, user.email)

  if (userId) {
    console.info(`auth user exists for ${user.email} (${userId})`)
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
    })
    if (error || !data.user) throw error ?? new Error(`createUser failed for ${user.email}`)
    userId = data.user.id
    console.info(`created auth user ${user.email} (${userId})`)
  }

  // Upsert the role row (id is the PK; re-runs converge on the same state).
  const { error } = await admin.from('users').upsert(
    {
      id: userId,
      email: user.email,
      name: user.role,
      role: user.role,
      restaurant_id: null,
      permissions: [],
      active: true,
    },
    { onConflict: 'id' },
  )
  if (error) throw error
  console.info(`upserted users row: ${user.email} → role=${user.role}, restaurant_id=null`)
}

async function main(): Promise<void> {
  const admin = createClient(resolve('SUPABASE_URL'), resolve('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const users: SeedUser[] = [
    {
      email: resolve('SUPERADMIN_EMAIL'),
      password: resolve('SUPERADMIN_PASSWORD'),
      role: 'superadmin',
    },
  ]

  // Support user is optional — only provisioned when both values resolve.
  const supportEmail = optional('SUPPORT_EMAIL')
  const supportPassword = optional('SUPPORT_PASSWORD')
  if (supportEmail && supportPassword) {
    users.push({ email: supportEmail, password: supportPassword, role: 'support' })
  }

  for (const user of users) {
    await provision(admin, user)
  }
  console.info('Done. Reminder: enrol TOTP on first sign-in, or set MFA_DEV_BYPASS="true" in .dev.vars for local use (see header).')
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
