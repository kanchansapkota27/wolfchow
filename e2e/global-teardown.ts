import { readFile, rm } from 'node:fs/promises'
import { createSupabaseAdmin } from './lib/supabase-admin'

interface SeedData {
  mainRestaurant: { restaurantId: string; ownerEmail: string }
}

export default async function globalTeardown(): Promise<void> {
  const admin = createSupabaseAdmin()

  let seed: SeedData | null = null
  try {
    seed = JSON.parse(await readFile('.tmp/seed.json', 'utf-8')) as SeedData
  } catch {
    return // global-setup never completed; nothing to clean up
  }

  // No superadmin delete-restaurant API exists, so this is a direct DB delete.
  // menu_categories/menu_items/users all reference restaurants with
  // ON DELETE CASCADE (confirmed in supabase/migrations/20260615000100_schema.sql),
  // so this cascades cleanly through the seeded fixtures.
  await admin.from('restaurants').delete().eq('id', seed.mainRestaurant.restaurantId)

  // The users row cascades away with the restaurant, but the auth.users row
  // does not — delete it separately.
  const { data: authUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  const ownerAuthUser = authUsers?.users.find((u) => u.email === seed!.mainRestaurant.ownerEmail)
  if (ownerAuthUser) await admin.auth.admin.deleteUser(ownerAuthUser.id)

  // Superadmin user is left in place (idempotent re-seed pattern, matches
  // scripts/seed-superadmin.ts — cheap to leave, avoids re-creating TOTP state
  // across runs since MFA_DEV_BYPASS skips that anyway in this environment).

  await rm('.tmp/seed.json', { force: true })
}
