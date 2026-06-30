import type { EmailTransport, EmailMessage } from './smtp'

/**
 * HTTP-based email transport for Cloudflare Workers.
 *
 * Workers cannot open raw TCP/SMTP connections. This transport auto-detects
 * the provider from `credentials.host` and calls the appropriate HTTP API.
 * The `password` field always holds the API key / server token.
 *
 * Supported hosts (detected by substring):
 *   resend.com        → Resend API
 *   postmarkapp.com   → Postmark API
 *   mailgun.org       → Mailgun API
 *   brevo.com         → Brevo API
 *   sendgrid.net      → SendGrid API
 */
export function createSmartTransport(): EmailTransport {
  return { send: sendViaHttp }
}

async function sendViaHttp(msg: EmailMessage): Promise<void> {
  const { host, password, from_email, from_name } = msg.credentials
  const from = `${from_name} <${from_email}>`

  if (host.includes('resend.com')) {
    return sendResend(msg.to, msg.subject, msg.html, from, password)
  }
  if (host.includes('postmarkapp.com')) {
    return sendPostmark(msg.to, msg.subject, msg.html, from, password)
  }
  if (host.includes('mailgun.org') || host.includes('api.mailgun.net')) {
    return sendMailgun(msg.to, msg.subject, msg.html, from, from_email, password)
  }
  if (host.includes('brevo.com') || host.includes('sendinblue.com')) {
    return sendBrevo(msg.to, msg.subject, msg.html, from_name, from_email, password)
  }
  if (host.includes('sendgrid.net') || host.includes('sendgrid.com')) {
    return sendSendGrid(msg.to, msg.subject, msg.html, from_name, from_email, password)
  }

  throw new Error(
    `unsupported_provider: "${host}" — Cloudflare Workers cannot open raw SMTP connections. ` +
    `Use Resend (smtp.resend.com), Postmark (smtp.postmarkapp.com), Mailgun (smtp.mailgun.org), ` +
    `Brevo (smtp-relay.brevo.com), or SendGrid (smtp.sendgrid.net).`,
  )
}

async function assertOk(res: Response, provider: string): Promise<void> {
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${provider}_error: ${res.status} ${body}`)
  }
}

async function sendResend(to: string, subject: string, html: string, from: string, apiKey: string): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  })
  await assertOk(res, 'resend')
}

async function sendPostmark(to: string, subject: string, html: string, from: string, serverToken: string): Promise<void> {
  const res = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': serverToken,
    },
    body: JSON.stringify({ From: from, To: to, Subject: subject, HtmlBody: html }),
  })
  await assertOk(res, 'postmark')
}

async function sendMailgun(
  to: string, subject: string, html: string,
  from: string, fromEmail: string, apiKey: string,
): Promise<void> {
  const domain = fromEmail.split('@')[1] ?? ''
  const res = await fetch(`https://api.mailgun.net/v3/${encodeURIComponent(domain)}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${btoa(`api:${apiKey}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ from, to, subject, html }).toString(),
  })
  await assertOk(res, 'mailgun')
}

async function sendBrevo(
  to: string, subject: string, html: string,
  fromName: string, fromEmail: string, apiKey: string,
): Promise<void> {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      sender: { name: fromName, email: fromEmail },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  })
  await assertOk(res, 'brevo')
}

async function sendSendGrid(
  to: string, subject: string, html: string,
  fromName: string, fromEmail: string, apiKey: string,
): Promise<void> {
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: fromEmail, name: fromName },
      subject,
      content: [{ type: 'text/html', value: html }],
    }),
  })
  // SendGrid returns 202 on success, not 200
  if (res.status !== 202 && !res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`sendgrid_error: ${res.status} ${body}`)
  }
}
