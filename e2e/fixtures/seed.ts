import { readFile } from 'node:fs/promises'

export interface SeedData {
  superadmin: { email: string; password: string }
  plan: { id: string }
  mainRestaurant: { restaurantId: string; slug: string; ownerEmail: string; ownerPassword: string; seededItemName: string }
  spareInvite: { token: string; url: string }
}

export async function readSeed(): Promise<SeedData> {
  const raw = await readFile('.tmp/seed.json', 'utf-8')
  return JSON.parse(raw) as SeedData
}
