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
 * failing on a duplicate. Run against local Supabase during development:
 *
 *   SUPABASE_URL=http://127.0.0.1:54321 \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   SUPERADMIN_EMAIL=admin@example.com SUPERADMIN_PASSWORD=... \
 *   SUPPORT_EMAIL=support@example.com SUPPORT_PASSWORD=... \
 *   npx tsx scripts/seed-superadmin.ts
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

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
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
  const admin = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const users: SeedUser[] = [
    {
      email: requireEnv('SUPERADMIN_EMAIL'),
      password: requireEnv('SUPERADMIN_PASSWORD'),
      role: 'superadmin',
    },
    {
      email: requireEnv('SUPPORT_EMAIL'),
      password: requireEnv('SUPPORT_PASSWORD'),
      role: 'support',
    },
  ]

  for (const user of users) {
    await provision(admin, user)
  }
  console.info('Done. Reminder: each user must enrol TOTP on first sign-in (see header).')
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
