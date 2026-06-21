-- Local development seed data.
-- Applied automatically by `supabase db reset` after migrations.
-- DO NOT run against production.

-- ── Seed restaurant owner in Supabase Auth ────────────────────────────────────
-- Password: devpassword123
-- Email:    admin@wolfchow.dev
INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'admin@wolfchow.dev',
  crypt('devpassword123', gen_salt('bf')),
  now(),
  jsonb_build_object(
    'provider', 'email',
    'providers', ARRAY['email']
  ),
  '{}',
  now(),
  now()
) ON CONFLICT (email) DO NOTHING;

-- ── Seed restaurant ───────────────────────────────────────────────────────────
INSERT INTO restaurants (
  id,
  slug,
  display_name,
  business_name,
  timezone,
  currency,
  plan_id
)
SELECT
  '00000000-0000-0000-0000-000000000002',
  'wolfchow-dev',
  'WolfChow Dev',
  'WolfChow Dev Ltd',
  'UTC',
  'USD',
  id
FROM plans WHERE name = 'Growth'
ON CONFLICT (slug) DO NOTHING;

-- ── Seed public.users profile for the owner ───────────────────────────────────
INSERT INTO public.users (
  id,
  restaurant_id,
  role,
  name,
  email,
  active
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  'restaurant_owner',
  'Dev Admin',
  'admin@wolfchow.dev',
  true
) ON CONFLICT (id) DO NOTHING;
