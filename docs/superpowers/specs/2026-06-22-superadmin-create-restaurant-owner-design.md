# Superadmin: Create Restaurant Owner

**Date:** 2026-06-22
**Status:** Approved
**Scope:** Backend API only — no frontend changes

---

## Problem

Superadmin can create a restaurant directly via `POST /superadmin/restaurants` (bypassing the invite flow), but the resulting restaurant has no owner. There is currently no way to provision an owner account for an existing restaurant without going through the invite-then-self-signup flow.

---

## Solution

Add `POST /superadmin/restaurants/:id/users` — a new endpoint in the existing superadmin restaurant routes that provisions a Supabase Auth account + `public.users` row with `role: restaurant_owner` for the named restaurant.

Multiple owners per restaurant are allowed (superadmin is trusted to decide this).

---

## API Contract

### Request

```
POST /superadmin/restaurants/:id/users
Authorization: Bearer <superadmin-jwt-with-totp>
Content-Type: application/json
```

```json
{
  "email": "owner@example.com",
  "password": "TemporaryPass123",
  "name": "Jane Smith",
  "phone": "+1-555-0100"
}
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `email` | string | yes | valid email format |
| `password` | string | yes | 8–72 chars (Supabase min/max) |
| `name` | string | yes | 1–255 chars |
| `phone` | string | no | max 50 chars |

### Success Response — `201 Created`

```json
{
  "user": {
    "id": "uuid",
    "email": "owner@example.com",
    "name": "Jane Smith",
    "role": "restaurant_owner",
    "restaurant_id": "uuid",
    "force_password_change": true,
    "created_at": "2026-06-22T10:00:00.000Z"
  }
}
```

### Error Responses

| Status | `error` | Condition |
|--------|---------|-----------|
| 404 | `restaurant_not_found` | `:id` does not match any restaurant |
| 409 | `email_taken` | Email already registered in Supabase Auth |
| 422 | `validation` | Body fails Zod schema (includes `issues` array) |
| 500 | `create_failed` | Auth user creation or DB insert failed |

---

## Implementation

### Files changed

- `src/routes/superadmin/schemas.ts` — add `createRestaurantUserSchema`
- `src/routes/superadmin/restaurants.ts` — add one route to `registerRestaurantRoutes`
- `src/routes/superadmin/restaurants.test.ts` — new test file

### Schema

```ts
// src/routes/superadmin/schemas.ts
export const createRestaurantUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
  name: z.string().min(1).max(255),
  phone: z.string().max(50).optional(),
})
```

### Handler logic (sequential)

1. Parse + validate body with `createRestaurantUserSchema` → 422 on failure
2. Confirm restaurant exists: `admin.from('restaurants').select('id').eq('id', id).maybeSingle()` → 404 if null
3. Create Supabase Auth user:
   ```ts
   admin.auth.admin.createUser({
     email,
     password,
     email_confirm: true,
     user_metadata: { force_password_change: true },
   })
   ```
   → 409 on "already been registered", 500 on other errors
4. Insert `public.users` row:
   ```ts
   admin.from('users').insert({
     id: userId,
     restaurant_id: id,
     role: 'restaurant_owner',
     name,
     phone: phone ?? null,
     email,
   })
   ```
   → on failure: `admin.auth.admin.deleteUser(userId)` to prevent orphan, then return 500
5. Fire-and-forget audit log entry:
   ```ts
   admin.from('audit_log').insert({
     restaurant_id: id,
     table_name: 'users',
     operation: 'CREATE_OWNER',
     user_id: caller.sub,
     new_data: { email, name, role: 'restaurant_owner' },
   })
   ```
6. Return 201 with user shape

### Force-password-change mechanism

`force_password_change: true` is stored in GoTrue `user_metadata` (no DB migration required). The frontend reads it from the Supabase session's `user.user_metadata` after login and redirects to a change-password screen. After the user changes their password, the frontend calls Supabase's `updateUser({ data: { force_password_change: false } })` to clear the flag.

---

## Tests

File: `src/routes/superadmin/restaurants.test.ts`
Describe block: `describe('POST /superadmin/restaurants/:id/users')`

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Valid body, restaurant exists | 201, correct user shape in response |
| 2 | Restaurant ID not found | 404 `restaurant_not_found` |
| 3 | Email already taken | 409 `email_taken` |
| 4 | Password too short (< 8 chars) | 422 `validation` |
| 5 | Missing required field (`name` omitted) | 422 `validation` |
| 6 | No JWT / wrong role (smoke) | 401/403 |
| 7 | `public.users` insert fails → auth user cleaned up | 500 `create_failed`, deleteUser called |

---

## What is NOT in scope

- Listing or removing users from a restaurant (separate feature)
- Forcing password change at the DB/JWT level (frontend convention via user_metadata)
- Frontend UI for this endpoint
- Any role other than `restaurant_owner`
