import { useEffect, useState } from 'react'
import { Button, Input } from '@wolfchow/ui'
import { ApiError } from '@wolfchow/api-client'
import { useAuth } from './context'

type Tab = 'staff' | 'device'

/**
 * Shared login page. Two tabs: staff (email + password) and device token (for
 * kitchen tablets). On success the auth context redirects by role. If the URL
 * carries `?invite=inv_…`, login is bypassed and the user is sent to signup.
 */
export function LoginPage() {
  const { signInWithPassword, signInWithDeviceToken, getQueryParam, navigate } = useAuth()
  const [tab, setTab] = useState<Tab>('staff')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [deviceToken, setDeviceToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const invite = getQueryParam('invite')
    if (invite) navigate(`/signup?invite=${encodeURIComponent(invite)}`)
  }, [getQueryParam, navigate])

  async function run(action: () => Promise<void>) {
    setError(null)
    setSubmitting(true)
    try {
      await action()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="wc-login">
      <div className="wc-login__card">
        <h1 className="wc-login__title">Welcome back</h1>
        <p className="wc-login__subtitle">Sign in to continue</p>

        <div className="wc-login__tabs" role="tablist" aria-label="Login method">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'staff'}
            onClick={() => setTab('staff')}
          >
            Staff login
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'device'}
            onClick={() => setTab('device')}
          >
            Device token
          </button>
        </div>

        {error && (
          <p className="wc-login__error" role="alert">
            {error}
          </p>
        )}

        {tab === 'staff' ? (
          <form
            className="wc-login__form"
            onSubmit={(event) => {
              event.preventDefault()
              void run(() => signInWithPassword(email, password))
            }}
          >
            <Input
              label="Email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <Button type="submit" loading={submitting}>
              Sign in
            </Button>
          </form>
        ) : (
          <form
            className="wc-login__form"
            onSubmit={(event) => {
              event.preventDefault()
              void run(() => signInWithDeviceToken(deviceToken))
            }}
          >
            <Input
              label="Device token"
              value={deviceToken}
              onChange={(event) => setDeviceToken(event.target.value)}
            />
            <Button type="submit" loading={submitting}>
              Connect device
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
