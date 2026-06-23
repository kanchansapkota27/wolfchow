import { useEffect, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Button, Input, Modal, useToast } from '@wolfchow/ui'
import { ApiError } from '@wolfchow/api-client'
import { useApi } from '../lib/api'

interface CreateOwnerModalProps {
  open: boolean
  restaurantId: string
  restaurantName: string
  onClose: () => void
}

interface FormState {
  name: string
  email: string
  password: string
  phone: string
}

function empty(): FormState {
  return { name: '', email: '', password: '', phone: '' }
}

export function CreateOwnerModal({
  open,
  restaurantId,
  restaurantName,
  onClose,
}: CreateOwnerModalProps) {
  const api = useApi()
  const { notify } = useToast()
  const [form, setForm] = useState<FormState>(empty)
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setForm(empty())
      setShowPassword(false)
      setError(null)
    }
  }, [open])

  function field(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((f) => ({ ...f, [key]: e.target.value }))
    }
  }

  async function submit() {
    if (!form.name.trim()) { setError('Full name is required.'); return }
    if (!form.email.trim()) { setError('Email is required.'); return }
    if (form.password.length < 8) { setError('Password must be at least 8 characters.'); return }

    setBusy(true)
    setError(null)
    try {
      const user = await api.superadmin.createRestaurantUser(restaurantId, {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone.trim() || undefined,
      })
      notify('success', `Owner account created for ${user.email}.`)
      onClose()
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        setError('That email address is already registered. Try a different one.')
      } else if (err instanceof ApiError && err.status === 422) {
        setError('Please check all fields and try again.')
      } else {
        setError('Failed to create owner account. Please try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Create owner for ${restaurantName}`}>
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          A Supabase Auth account will be created with{' '}
          <strong className="text-gray-900">restaurant_owner</strong> role. The owner must change
          their password on first login.
        </p>

        <Input
          label="Full name"
          placeholder="Jane Smith"
          value={form.name}
          onChange={field('name')}
          autoComplete="off"
        />

        <Input
          label="Email"
          type="email"
          placeholder="owner@example.com"
          value={form.email}
          onChange={field('email')}
          autoComplete="off"
        />

        <div className="relative">
          <Input
            label="Temporary password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Min. 8 characters"
            value={form.password}
            onChange={field('password')}
            helperText="Owner will be prompted to change this on first login."
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute right-3 top-8 text-gray-400 hover:text-gray-700"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        <Input
          label="Phone (optional)"
          type="tel"
          placeholder="+1-555-0100"
          value={form.phone}
          onChange={field('phone')}
        />

        {error && (
          <p role="alert" className="text-sm text-red-500">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => void submit()}>
            Create owner
          </Button>
        </div>
      </div>
    </Modal>
  )
}
