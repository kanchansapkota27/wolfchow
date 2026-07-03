import type { Env } from '../types'
import { SmtpService, SmtpLimitExceededError, NoSmtpConfigError, type EmailTransport } from './smtp'
import { createAdminClient } from './supabase'

// ── Order data shape used across all email types ────────────────────────────

export interface NotificationOrderItem {
  item_name: string | null
  variant_name: string | null
  quantity: number
  unit_price: number
  modifiers: Array<{ name: string; price_delta: number }>
  notes: string | null
}

export interface NotificationOrder {
  id: string
  tracking_token: string
  customer_name: string
  customer_email: string
  total: number
  payment_method: string
  items?: NotificationOrderItem[]
  notes: string | null
  scheduled_for: string | null
}

// ── Notification defaults (mirrors the admin route's DEFAULT_SEND_CUSTOMER) ──

const NOTIFY_CUSTOMER_DEFAULTS: Record<string, boolean> = {
  pending_payment: false,
  scheduled: true,
  auth_success: true,
  accepted: true,
  preparing: false,
  ready: true,
  completed: false,
  rejected: true,
  missed: true,
  refunded: true,
}

// ── Service ─────────────────────────────────────────────────────────────────

/**
 * Sends transactional order emails through SmtpService. All public methods
 * consult `notification_config` to respect per-status admin settings before
 * sending. Send failures (limit exceeded, no SMTP config, transport error)
 * are swallowed — email is best-effort. `sendPreview` is an exception: it
 * surfaces errors so the admin can diagnose SMTP misconfiguration.
 */
export class NotificationService {
  private readonly smtp: SmtpService
  private readonly widgetBaseUrl: string
  private readonly admin: ReturnType<typeof createAdminClient>

  constructor(env: Env, transport: EmailTransport) {
    this.smtp = new SmtpService(env, transport)
    this.widgetBaseUrl = env.WIDGET_BASE_URL?.replace(/\/$/, '') ?? ''
    this.admin = createAdminClient(env)
  }

  async sendOrderConfirmation(restaurantId: string, order: NotificationOrder): Promise<void> {
    const status = order.scheduled_for ? 'scheduled' : 'auth_success'
    const cfg = await this.resolveConfig(restaurantId, status)
    const subject = `Order received — #${shortId(order.id)}`
    const html = confirmationHtml(order, this.widgetBaseUrl)
    if (cfg.sendToCustomer) {
      await this.trySend(restaurantId, order.customer_email, subject, html)
    } else {
      await this.logSuppressed(restaurantId, order.customer_email, subject)
    }
    for (const to of cfg.internalRecipients) {
      await this.trySend(restaurantId, to, `[Internal] ${subject}`, html)
    }
  }

  async sendOrderAccepted(restaurantId: string, order: NotificationOrder): Promise<void> {
    const cfg = await this.resolveConfig(restaurantId, 'accepted')
    const subject = `Your order is being prepared — #${shortId(order.id)}`
    const html = acceptedHtml(order, this.widgetBaseUrl)
    if (cfg.sendToCustomer) {
      await this.trySend(restaurantId, order.customer_email, subject, html)
    } else {
      await this.logSuppressed(restaurantId, order.customer_email, subject)
    }
    for (const to of cfg.internalRecipients) {
      await this.trySend(restaurantId, to, `[Internal] ${subject}`, html)
    }
  }

  async sendOrderRejected(restaurantId: string, order: NotificationOrder, reason?: string | null): Promise<void> {
    const cfg = await this.resolveConfig(restaurantId, 'rejected')
    const subject = `Your order was cancelled — #${shortId(order.id)}`
    const html = rejectedHtml(order, reason ?? null)
    if (cfg.sendToCustomer) {
      await this.trySend(restaurantId, order.customer_email, subject, html)
    } else {
      await this.logSuppressed(restaurantId, order.customer_email, subject)
    }
    for (const to of cfg.internalRecipients) {
      await this.trySend(restaurantId, to, `[Internal] ${subject}`, html)
    }
  }

  async sendOrderReady(restaurantId: string, order: NotificationOrder): Promise<void> {
    const cfg = await this.resolveConfig(restaurantId, 'ready')
    const subject = `Your order is ready! — #${shortId(order.id)}`
    const html = readyHtml(order, this.widgetBaseUrl)
    if (cfg.sendToCustomer) {
      await this.trySend(restaurantId, order.customer_email, subject, html)
    } else {
      await this.logSuppressed(restaurantId, order.customer_email, subject)
    }
    for (const to of cfg.internalRecipients) {
      await this.trySend(restaurantId, to, `[Internal] ${subject}`, html)
    }
  }

  async sendPreview(restaurantId: string, status: string, to: string): Promise<void> {
    const order: NotificationOrder = {
      id: 'aaaaaaaa-bbbb-cccc-dddd-preview000001',
      tracking_token: 'tok_preview_0000001',
      customer_name: 'Preview Customer',
      customer_email: to,
      total: 24.49,
      payment_method: 'card',
      items: [
        { item_name: 'Classic Cheeseburger', variant_name: null, quantity: 2, unit_price: 9.99, modifiers: [{ name: 'Extra Cheese', price_delta: 0.50 }], notes: null },
        { item_name: 'Truffle Fries', variant_name: 'Large', quantity: 1, unit_price: 4.51, modifiers: [], notes: 'Extra crispy please' },
      ],
      notes: null,
      scheduled_for: null,
    }

    let subject: string
    let html: string

    switch (status) {
      case 'accepted':
        subject = `[Preview] Your order is being prepared — #${shortId(order.id)}`
        html = acceptedHtml(order, this.widgetBaseUrl)
        break
      case 'rejected':
        subject = `[Preview] Your order was cancelled — #${shortId(order.id)}`
        html = rejectedHtml(order, 'Out of stock — sorry for the inconvenience')
        break
      case 'ready':
        subject = `[Preview] Your order is ready! — #${shortId(order.id)}`
        html = readyHtml(order, this.widgetBaseUrl)
        break
      default:
        subject = `[Preview] Order received — #${shortId(order.id)}`
        html = confirmationHtml(order, this.widgetBaseUrl)
    }

    // Bypass trySend — errors must surface so the admin sees the config issue
    await this.smtp.send({ restaurant_id: restaurantId, to, subject, html })
  }

  private async resolveConfig(
    restaurantId: string,
    status: string,
  ): Promise<{ sendToCustomer: boolean; internalRecipients: string[] }> {
    const defaultResult = { sendToCustomer: NOTIFY_CUSTOMER_DEFAULTS[status] ?? false, internalRecipients: [] }
    try {
      const { data } = await this.admin
        .from('notification_config')
        .select('send_customer, internal_recipients')
        .eq('restaurant_id', restaurantId)
        .eq('trigger_status', status)
        .maybeSingle()

      if (!data) return defaultResult
      const row = data as { send_customer: boolean; internal_recipients: string[] | null }
      return { sendToCustomer: row.send_customer, internalRecipients: row.internal_recipients ?? [] }
    } catch {
      return defaultResult
    }
  }

  private async trySend(restaurantId: string, to: string, subject: string, html: string): Promise<void> {
    try {
      await this.smtp.send({ restaurant_id: restaurantId, to, subject, html })
    } catch (err) {
      if (err instanceof SmtpLimitExceededError || err instanceof NoSmtpConfigError) return
      // Unknown transport errors are also swallowed — email is best-effort
    }
  }

  private async logSuppressed(restaurantId: string, to: string, subject: string): Promise<void> {
    try {
      await this.admin.from('email_log').insert({
        restaurant_id: restaurantId,
        to_address: to,
        subject,
        smtp_source: null,
        status: 'suppressed',
        failure_reason: 'send_customer=false in notification_config',
      })
    } catch {
      // best-effort
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function esc(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function shortId(orderId: string): string {
  return orderId.slice(-8).toUpperCase()
}

function trackingUrl(widgetBaseUrl: string, token: string): string | null {
  return widgetBaseUrl ? `${widgetBaseUrl}/track/${token}` : null
}

function fmt(amount: number): string {
  return `$${Number(amount).toFixed(2)}`
}

// ── Shared HTML primitives ────────────────────────────────────────────────────

function emailWrap(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="100%" style="max-width:520px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">
        ${body}
      </table>
      <p style="margin-top:24px;font-size:12px;color:#9ca3af;text-align:center">
        This is an automated message — please do not reply.
      </p>
    </td></tr>
  </table>
</body>
</html>`
}

function header(color: string, emoji: string, title: string): string {
  return `<tr><td style="background:${color};padding:28px 32px;text-align:center">
    <div style="font-size:36px;margin-bottom:8px">${emoji}</div>
    <h1 style="margin:0;font-size:20px;font-weight:700;color:#fff">${title}</h1>
  </td></tr>`
}

function section(content: string): string {
  return `<tr><td style="padding:24px 32px">${content}</td></tr>`
}

function itemsTable(items: NotificationOrderItem[]): string {
  if (!items.length) return ''
  const rows = items.map((item) => {
    const name = esc(item.item_name ?? item.variant_name ?? 'Item')
    const suffix = item.variant_name && item.variant_name !== item.item_name
      ? ` <span style="color:#6b7280;font-weight:400">— ${esc(item.variant_name)}</span>`
      : ''
    const mods = item.modifiers.length
      ? `<div style="margin-top:2px;font-size:12px;color:#6b7280">${item.modifiers.map(
          (m) => `+&nbsp;${esc(m.name)}${m.price_delta !== 0 ? ` (${fmt(m.price_delta)})` : ''}`,
        ).join('<br>')}</div>`
      : ''
    const note = item.notes
      ? `<div style="margin-top:2px;font-size:12px;color:#9ca3af;font-style:italic">Note: ${esc(item.notes)}</div>`
      : ''
    return `<tr>
      <td style="padding:6px 0;vertical-align:top">
        <span style="font-size:13px;color:#374151;font-weight:600">${item.quantity}×</span>
        <span style="font-size:13px;color:#111827;font-weight:600;margin-left:4px">${name}${suffix}</span>
        ${mods}${note}
      </td>
      <td style="padding:6px 0;vertical-align:top;text-align:right;white-space:nowrap">
        <span style="font-size:13px;color:#374151">${fmt(item.unit_price * item.quantity)}</span>
      </td>
    </tr>`
  }).join('')
  return `<table role="presentation" width="100%" style="border-collapse:collapse;border-top:1px solid #e5e7eb;margin-top:16px">
    ${rows}
    </table>`
}

function trackingButton(url: string): string {
  return `<p style="margin:20px 0 0;text-align:center">
    <a href="${url}" style="display:inline-block;background:#16a34a;color:#fff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none">
      Track your order →
    </a>
  </p>`
}

function orderMeta(order: NotificationOrder): string {
  const method = order.payment_method === 'card' ? '💳 Card' : order.payment_method === 'pickup' ? '💵 Cash' : '🛵 Delivery'
  const scheduled = order.scheduled_for
    ? `<p style="margin:4px 0;font-size:13px;color:#374151"><strong>Scheduled:</strong> ${esc(new Date(order.scheduled_for).toLocaleString())}</p>`
    : ''
  return `<p style="margin:0 0 4px;font-size:15px;color:#111827;font-weight:600">${esc(order.customer_name)}</p>
    <p style="margin:4px 0;font-size:13px;color:#374151"><strong>Payment:</strong> ${method}</p>
    ${scheduled}
    <p style="margin:4px 0;font-size:13px;color:#374151"><strong>Total:</strong> ${fmt(order.total)}</p>`
}

// ── Email templates ───────────────────────────────────────────────────────────

function confirmationHtml(order: NotificationOrder, widgetBaseUrl: string): string {
  const tUrl = trackingUrl(widgetBaseUrl, order.tracking_token)
  const noteBlock = order.notes
    ? `<p style="margin:12px 0 0;padding:10px 14px;background:#fefce8;border-radius:6px;font-size:13px;color:#713f12;font-style:italic">&ldquo;${esc(order.notes)}&rdquo;</p>`
    : ''
  return emailWrap(`
    ${header('#16a34a', '🎉', 'Order Received!')}
    ${section(`
      <p style="margin:0 0 16px;font-size:14px;color:#374151">
        Hi <strong>${esc(order.customer_name)}</strong>, we've received your order and it's being prepared.
      </p>
      ${orderMeta(order)}
      ${noteBlock}
      ${itemsTable(order.items ?? [])}
      ${tUrl ? trackingButton(tUrl) : ''}
    `)}
  `)
}

function acceptedHtml(order: NotificationOrder, widgetBaseUrl: string): string {
  const tUrl = trackingUrl(widgetBaseUrl, order.tracking_token)
  return emailWrap(`
    ${header('#2563eb', '✅', 'Order Accepted!')}
    ${section(`
      <p style="margin:0 0 16px;font-size:14px;color:#374151">
        Hi <strong>${esc(order.customer_name)}</strong>, great news — your order has been accepted and is now being prepared.
      </p>
      ${orderMeta(order)}
      ${itemsTable(order.items ?? [])}
      ${tUrl ? trackingButton(tUrl) : ''}
    `)}
  `)
}

function rejectedHtml(order: NotificationOrder, reason: string | null): string {
  const reasonBlock = reason
    ? `<p style="margin:12px 0 0;padding:10px 14px;background:#fef2f2;border-radius:6px;font-size:13px;color:#7f1d1d">
        <strong>Reason:</strong> ${esc(reason)}
      </p>`
    : ''
  return emailWrap(`
    ${header('#dc2626', '❌', 'Order Cancelled')}
    ${section(`
      <p style="margin:0 0 16px;font-size:14px;color:#374151">
        Hi <strong>${esc(order.customer_name)}</strong>, we're sorry — your order could not be fulfilled at this time.
      </p>
      ${orderMeta(order)}
      ${reasonBlock}
      <p style="margin:16px 0 0;font-size:13px;color:#6b7280">
        If you were charged, your payment will be refunded within 3&ndash;5 business days.
      </p>
    `)}
  `)
}

function readyHtml(order: NotificationOrder, widgetBaseUrl: string): string {
  const tUrl = trackingUrl(widgetBaseUrl, order.tracking_token)
  return emailWrap(`
    ${header('#0891b2', '🛎️', 'Your Order is Ready!')}
    ${section(`
      <p style="margin:0 0 16px;font-size:14px;color:#374151">
        Hi <strong>${esc(order.customer_name)}</strong>, your order is ready and waiting for you.
      </p>
      ${orderMeta(order)}
      ${tUrl ? trackingButton(tUrl) : ''}
    `)}
  `)
}
