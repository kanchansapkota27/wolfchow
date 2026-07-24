import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createSmartTransport } from './email-transport'
import type { EmailMessage } from './smtp'

const transport = createSmartTransport()

function msg(overrides: Partial<EmailMessage> = {}): EmailMessage {
  return {
    credentials: {
      host: 'smtp.resend.com',
      port: 587,
      username: 'resend',
      password: 'key_test',
      from_email: 'orders@example.com',
      from_name: 'Test Restaurant',
    },
    to: 'primary@example.com',
    subject: 'Test',
    html: '<p>hi</p>',
    ...overrides,
  }
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })))
})

describe('email-transport: cc support', () => {
  it('resend: cc array included in the request body when present', async () => {
    await transport.send(msg({ cc: ['second@example.com', 'third@example.com'] }))
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]!
    const body = JSON.parse(init.body as string)
    expect(body.cc).toEqual(['second@example.com', 'third@example.com'])
  })

  it('resend: no cc key when cc is empty/absent', async () => {
    await transport.send(msg())
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]!
    const body = JSON.parse(init.body as string)
    expect(body).not.toHaveProperty('cc')
  })

  it('postmark: Cc is a comma-joined string', async () => {
    await transport.send(msg({
      credentials: { host: 'smtp.postmarkapp.com', port: 587, username: 'x', password: 'tok', from_email: 'a@b.com', from_name: 'A' },
      cc: ['second@example.com', 'third@example.com'],
    }))
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]!
    const body = JSON.parse(init.body as string)
    expect(body.Cc).toBe('second@example.com,third@example.com')
  })

  it('mailgun: cc is a comma-joined form param', async () => {
    await transport.send(msg({
      credentials: { host: 'smtp.mailgun.org', port: 587, username: 'x', password: 'key', from_email: 'a@b.com', from_name: 'A' },
      cc: ['second@example.com'],
    }))
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]!
    const params = new URLSearchParams(init.body as string)
    expect(params.get('cc')).toBe('second@example.com')
  })

  it('brevo: cc is an array of {email} objects', async () => {
    await transport.send(msg({
      credentials: { host: 'smtp-relay.brevo.com', port: 587, username: 'x', password: 'key', from_email: 'a@b.com', from_name: 'A' },
      cc: ['second@example.com'],
    }))
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]!
    const body = JSON.parse(init.body as string)
    expect(body.cc).toEqual([{ email: 'second@example.com' }])
  })

  it('sendgrid: cc nested inside personalizations[0]', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 202 })))
    await transport.send(msg({
      credentials: { host: 'smtp.sendgrid.net', port: 587, username: 'x', password: 'key', from_email: 'a@b.com', from_name: 'A' },
      cc: ['second@example.com'],
    }))
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]!
    const body = JSON.parse(init.body as string)
    expect(body.personalizations[0].cc).toEqual([{ email: 'second@example.com' }])
  })
})
