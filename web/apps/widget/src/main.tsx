import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { PublicSettings } from '@wolfchow/api-client'
import { App } from './App'
import { WIDGET_HOST_ID, injectCssVars, mountWidgetInShadow } from './bootstrap'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'https://api.wolfchow.com'

async function fetchSettings(slug: string): Promise<PublicSettings> {
  const res = await fetch(`${API_BASE}/public/${slug}/settings`)
  if (!res.ok) throw new Error(`settings fetch failed: ${res.status}`)
  return res.json() as Promise<PublicSettings>
}

async function bootstrap(): Promise<void> {
  const host = document.getElementById(WIDGET_HOST_ID)
  if (!host) return

  const slug = host.dataset['restaurant']
  if (!slug) {
    console.error('[restroapi-widget] missing data-restaurant attribute')
    return
  }

  const { container } = mountWidgetInShadow(host)
  const root = createRoot(container)

  root.render(
    <StrictMode>
      <App state="loading" settings={null} />
    </StrictMode>,
  )

  try {
    const settings = await fetchSettings(slug)
    injectCssVars(host, settings)
    root.render(
      <StrictMode>
        <App state="ready" settings={settings} />
      </StrictMode>,
    )
  } catch {
    root.render(
      <StrictMode>
        <App state="error" settings={null} />
      </StrictMode>,
    )
  }
}

bootstrap()
