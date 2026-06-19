import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ApiClient } from '@wolfchow/api-client'
import type { RestaurantListItem, SmtpConfig, SmtpOverrideItem } from '@wolfchow/types'
import { ToastProvider } from '@wolfchow/ui'
import { ApiProvider } from '../lib/api'
import { Smtp } from './Smtp'

type SuperadminApi = ApiClient['superadmin']

function globalConfig(over: Partial<SmtpConfig> = {}): SmtpConfig {
  return {
    id: 'cfg-global',
    restaurant_id: null,
    host: 'smtp.example.com',
    port: 587,
    username: 'user@example.com',
    from_email: 'no-reply@example.com',
    from_name: 'RestroAPI',
    monthly_limit: null,
    has_password: true,
    ...over,
  }
}

function restaurant(over: Partial<RestaurantListItem> = {}): RestaurantListItem {
  return {
    id: 'rest-abc',
    slug: 'burger-place',
    display_name: 'The Burger Place',
    plan_id: null,
    plan_name: null,
    active: true,
    commission_rate: 0.05,
    billing_note: null,
    created_at: '2026-01-01T00:00:00Z',
    order_count_30d: 0,
    ...over,
  }
}

function override(over: Partial<SmtpOverrideItem> = {}): SmtpOverrideItem {
  return {
    id: 'cfg-ov-1',
    restaurant_id: 'rest-abc',
    restaurant_name: 'The Burger Place',
    host: 'smtp.burgerjoint.com',
    port: 465,
    username: 'smtp@burgerjoint.com',
    from_email: 'orders@burgerjoint.com',
    from_name: 'Burger Place',
    monthly_limit: 1000,
    has_password: true,
    monthly_used: 42,
    ...over,
  }
}

function fakeClient(superadmin: Partial<SuperadminApi>): ApiClient {
  return { superadmin } as unknown as ApiClient
}

function renderSmtp(client: ApiClient) {
  return render(
    <ToastProvider>
      <ApiProvider client={client}>
        <Smtp />
      </ApiProvider>
    </ToastProvider>,
  )
}

const listRestaurants = vi
  .fn<SuperadminApi['listRestaurants']>()
  .mockResolvedValue({ restaurants: [restaurant()], page: 1, page_size: 200, total: 1 })

describe('STORY-053 · SMTP UI — global config', () => {
  it('password is never shown in the config display', async () => {
    const getSmtpGlobal = vi
      .fn<SuperadminApi['getSmtpGlobal']>()
      .mockResolvedValue({ config: globalConfig() })
    const listSmtpOverrides = vi
      .fn<SuperadminApi['listSmtpOverrides']>()
      .mockResolvedValue({ overrides: [] })
    const client = fakeClient({ getSmtpGlobal, listSmtpOverrides, listRestaurants })

    renderSmtp(client)

    // Wait for the host to appear so we know the config loaded
    expect(await screen.findByText(/smtp\.example\.com/)).toBeInTheDocument()

    // Password field must never appear in the DOM
    expect(screen.queryByDisplayValue('supersecret')).not.toBeInTheDocument()
    // Only the masking placeholder bullets are acceptable
    expect(screen.getByText('••••••••')).toBeInTheDocument()
  })

  it('edit form: no password field when config exists and field left empty (keep current)', async () => {
    const getSmtpGlobal = vi
      .fn<SuperadminApi['getSmtpGlobal']>()
      .mockResolvedValue({ config: globalConfig({ has_password: true }) })
    const putSmtpGlobal = vi.fn<SuperadminApi['putSmtpGlobal']>().mockResolvedValue({ ok: true })
    const listSmtpOverrides = vi
      .fn<SuperadminApi['listSmtpOverrides']>()
      .mockResolvedValue({ overrides: [] })
    const client = fakeClient({ getSmtpGlobal, putSmtpGlobal, listSmtpOverrides, listRestaurants })

    renderSmtp(client)

    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))

    const passwordInput = screen.getByLabelText(/password \(leave blank to keep current\)/i)
    expect(passwordInput).toHaveValue('')

    // Save without entering password → should send placeholder, not an empty string
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(putSmtpGlobal).toHaveBeenCalled())
    const body = putSmtpGlobal.mock.calls[0]![0]
    expect(body.password).toBe('<<unchanged>>')
  })

  it('send test email: success toast shows sent_to address', async () => {
    const getSmtpGlobal = vi
      .fn<SuperadminApi['getSmtpGlobal']>()
      .mockResolvedValue({ config: globalConfig() })
    const listSmtpOverrides = vi
      .fn<SuperadminApi['listSmtpOverrides']>()
      .mockResolvedValue({ overrides: [] })
    const testSmtpGlobal = vi
      .fn<SuperadminApi['testSmtpGlobal']>()
      .mockResolvedValue({ ok: true, sent_to: 'admin@example.com' })
    const client = fakeClient({ getSmtpGlobal, listSmtpOverrides, testSmtpGlobal, listRestaurants })

    renderSmtp(client)

    await userEvent.click(await screen.findByRole('button', { name: 'Send test email' }))

    expect(testSmtpGlobal).toHaveBeenCalledOnce()
    await screen.findByText(/test email sent to admin@example\.com/i)
  })

  it('send test email: failure shows error toast', async () => {
    const getSmtpGlobal = vi
      .fn<SuperadminApi['getSmtpGlobal']>()
      .mockResolvedValue({ config: globalConfig() })
    const listSmtpOverrides = vi
      .fn<SuperadminApi['listSmtpOverrides']>()
      .mockResolvedValue({ overrides: [] })
    const testSmtpGlobal = vi
      .fn<SuperadminApi['testSmtpGlobal']>()
      .mockRejectedValue(new Error('503'))
    const client = fakeClient({ getSmtpGlobal, listSmtpOverrides, testSmtpGlobal, listRestaurants })

    renderSmtp(client)

    await userEvent.click(await screen.findByRole('button', { name: 'Send test email' }))
    await screen.findByText(/test email failed/i)
  })
})

describe('STORY-053 · SMTP UI — per-restaurant overrides', () => {
  it('override table: shows restaurant name, host, usage/limit', async () => {
    const getSmtpGlobal = vi
      .fn<SuperadminApi['getSmtpGlobal']>()
      .mockResolvedValue({ config: globalConfig() })
    const listSmtpOverrides = vi
      .fn<SuperadminApi['listSmtpOverrides']>()
      .mockResolvedValue({ overrides: [override()] })
    const client = fakeClient({ getSmtpGlobal, listSmtpOverrides, listRestaurants })

    renderSmtp(client)

    expect(await screen.findByText('The Burger Place')).toBeInTheDocument()
    expect(screen.getByText('smtp.burgerjoint.com:465')).toBeInTheDocument()
    expect(screen.getByText('42 / 1000')).toBeInTheDocument()
  })

  it('add override: form saved, table reloads', async () => {
    const getSmtpGlobal = vi
      .fn<SuperadminApi['getSmtpGlobal']>()
      .mockResolvedValue({ config: globalConfig() })
    const listSmtpOverrides = vi
      .fn<SuperadminApi['listSmtpOverrides']>()
      .mockResolvedValueOnce({ overrides: [] })
      .mockResolvedValueOnce({ overrides: [override()] })
    const putSmtpOverride = vi
      .fn<SuperadminApi['putSmtpOverride']>()
      .mockResolvedValue({ ok: true })
    const client = fakeClient({ getSmtpGlobal, listSmtpOverrides, putSmtpOverride, listRestaurants })

    renderSmtp(client)

    await userEvent.click(await screen.findByRole('button', { name: 'Add override' }))

    const dialog = await screen.findByRole('dialog', { name: 'Add SMTP override' })
    // Select restaurant via searchable combobox
    const restaurantInput = within(dialog).getByRole('combobox', { name: /restaurant/i })
    await userEvent.click(restaurantInput)
    await userEvent.clear(restaurantInput)
    await userEvent.type(restaurantInput, 'Burger')
    await userEvent.click(await screen.findByRole('option', { name: 'The Burger Place' }))

    await userEvent.type(within(dialog).getByLabelText(/^host/i), 'smtp.burgerjoint.com')
    await userEvent.clear(within(dialog).getByLabelText(/^port/i))
    await userEvent.type(within(dialog).getByLabelText(/^port/i), '465')
    await userEvent.type(within(dialog).getByLabelText(/^username/i), 'smtp@burgerjoint.com')
    await userEvent.type(within(dialog).getByLabelText(/^password/i), 'pass123')
    await userEvent.type(within(dialog).getByLabelText(/from email/i), 'orders@burgerjoint.com')
    await userEvent.type(within(dialog).getByLabelText(/from name/i), 'Burger Place')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save override' }))

    await waitFor(() => expect(putSmtpOverride).toHaveBeenCalledWith('rest-abc', expect.objectContaining({
      host: 'smtp.burgerjoint.com',
      port: 465,
    })))
    // After reload the row should appear
    expect(await screen.findByText('The Burger Place')).toBeInTheDocument()
  })

  it('remove override: confirm dialog, calls deleteSmtpOverride', async () => {
    const getSmtpGlobal = vi
      .fn<SuperadminApi['getSmtpGlobal']>()
      .mockResolvedValue({ config: globalConfig() })
    const listSmtpOverrides = vi
      .fn<SuperadminApi['listSmtpOverrides']>()
      .mockResolvedValueOnce({ overrides: [override()] })
      .mockResolvedValueOnce({ overrides: [] })
    const deleteSmtpOverride = vi
      .fn<SuperadminApi['deleteSmtpOverride']>()
      .mockResolvedValue(undefined)
    const client = fakeClient({ getSmtpGlobal, listSmtpOverrides, deleteSmtpOverride, listRestaurants })

    renderSmtp(client)

    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }))
    const dialog = await screen.findByRole('dialog', { name: 'Remove SMTP override' })
    expect(dialog).toHaveTextContent('The Burger Place')

    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(deleteSmtpOverride).toHaveBeenCalledWith('rest-abc'))
    await waitFor(() =>
      expect(screen.queryByText('The Burger Place')).not.toBeInTheDocument(),
    )
  })
})
