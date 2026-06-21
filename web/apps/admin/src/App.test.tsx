import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { App } from './App'

const mockApiFetch = vi.fn()
const mockNavigate = vi.fn()
const mockGetQueryParam = vi.fn()

vi.mock('@wolfchow/auth', () => ({
  LoginPage: () => <div data-testid="login-page">Login</div>,
  RequireRole: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({
    user: { email: 'owner@test.com', role: 'restaurant_owner' },
    role: 'restaurant_owner',
    restaurantId: 'r1',
    permissions: [],
    isImpersonating: false,
    isLoading: false,
    logout: vi.fn(),
    navigate: mockNavigate,
    getQueryParam: mockGetQueryParam,
    hasPermission: () => false,
    signInWithPassword: vi.fn(),
    signInWithDeviceToken: vi.fn(),
    exitImpersonation: vi.fn(),
    refresh: vi.fn(),
  }),
}))

vi.mock('./lib/api', () => ({
  ApiProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useApi: () => ({ apiFetch: mockApiFetch }),
}))

vi.mock('@wolfchow/ui', () => ({
  Button: ({ children, onClick, loading }: { children: React.ReactNode; onClick?: () => void; loading?: boolean }) => (
    <button onClick={onClick} disabled={loading}>{children}</button>
  ),
  Input: ({ label, value, onChange, ...rest }: { label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; [key: string]: unknown }) => (
    <div>
      <label>{label}</label>
      <input aria-label={label} value={value} onChange={onChange} {...rest} />
    </div>
  ),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

beforeEach(() => {
  vi.resetAllMocks()
  mockGetQueryParam.mockReturnValue(null)
})

function renderApp(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
    </MemoryRouter>,
  )
}

describe('STORY-056 · Admin panel scaffold & signup', () => {
  it('invalid invite in URL: error page shown', () => {
    renderApp('/signup')
    expect(screen.getByText(/invalid invite link/i)).toBeTruthy()
  })

  it('signup with invite token: step 1 rendered', () => {
    renderApp('/signup?invite=inv_test123')
    expect(screen.getByText(/your account/i)).toBeTruthy()
  })

  it('step 1 missing name: Next blocked with error', () => {
    renderApp('/signup?invite=inv_test123')
    fireEvent.click(screen.getByText('Next'))
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText(/name is required/i)).toBeTruthy()
  })

  it('password mismatch: inline error shown', () => {
    renderApp('/signup?invite=inv_test123')
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Test Owner' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'owner@test.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password1' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'password2' } })
    fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText(/passwords do not match/i)).toBeTruthy()
  })

  it('slug preview: updates as business name changes', () => {
    renderApp('/signup?invite=inv_test123')
    // Fill step 1 to advance
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Test Owner' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'owner@test.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'abc12345' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'abc12345' } })
    fireEvent.click(screen.getByText('Next'))
    // Now on step 2
    fireEvent.change(screen.getByLabelText('Business name'), { target: { value: 'My Cool Café' } })
    expect(screen.getByText(/my-cool-caf/i)).toBeTruthy()
  })

  it('submit: API called, redirect to dashboard', async () => {
    mockApiFetch.mockResolvedValue({})
    renderApp('/signup?invite=inv_test123')
    // Step 1
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Test Owner' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'owner@test.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'abc12345' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'abc12345' } })
    fireEvent.click(screen.getByText('Next'))
    // Step 2
    fireEvent.change(screen.getByLabelText('Business name'), { target: { value: 'Test Restaurant' } })
    fireEvent.click(screen.getByText('Next'))
    // Step 3 — submit
    fireEvent.click(screen.getByText('Create account'))
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith(
      '/auth/signup',
      expect.objectContaining({ method: 'POST', skipAuth: true }),
    ))
  })

  it('dashboard route: renders dashboard heading', () => {
    renderApp('/')
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy()
  })
})
