import type { Stripe } from '@stripe/stripe-js'

// Load Stripe.js from CDN (more reliable than @stripe/stripe-js in bundled IIFE context)
export function createStripeInstance(publishableKey: string): Promise<Stripe> {
  if (!publishableKey.startsWith('pk_test_') && !publishableKey.startsWith('pk_live_')) {
    return Promise.reject(
      new Error(`Stripe key must start with pk_test_ or pk_live_ — got "${publishableKey.slice(0, 12)}…". ` +
        'Set your Stripe publishable key (not the secret key) in Admin → Payments.'),
    )
  }

  return new Promise((resolve, reject) => {
    const win = window as unknown as Record<string, unknown>

    const init = () => {
      const Constructor = win['Stripe'] as ((key: string) => Stripe) | undefined
      if (Constructor) {
        try { resolve(Constructor(publishableKey)) }
        catch (e) { reject(e) }
      } else {
        reject(new Error('Stripe.js loaded but window.Stripe is not available'))
      }
    }

    if (win['Stripe']) { init(); return }

    let script = document.querySelector<HTMLScriptElement>('script[src="https://js.stripe.com/v3/"]')
    const alreadyInDom = !!script

    if (!script) {
      script = document.createElement('script')
      script.src = 'https://js.stripe.com/v3/'
      script.async = true
      document.head.appendChild(script)
    }

    script.addEventListener('load', init, { once: true })
    script.addEventListener('error', () =>
      reject(new Error('Failed to fetch https://js.stripe.com/v3/ — check internet connection or CSP headers')),
    { once: true })

    // Already in DOM but not yet initialised → listeners above handle it.
    // Already in DOM AND script already ran (Stripe set synchronously before our listener) → call init now.
    if (alreadyInDom && win['Stripe']) init()
  })
}
