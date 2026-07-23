import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { WidgetSettings } from './types'
import { App } from './App'
import { WIDGET_HOST_ID, injectCssVars, mountWidgetInShadow } from './bootstrap'

const ENV_API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'https://api.wolfchow.com'
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } })

async function fetchSettings(apiBase: string, slug: string): Promise<WidgetSettings> {
  const res = await fetch(`${apiBase}/public/${slug}/settings`)
  if (!res.ok) throw new Error(`settings fetch failed: ${res.status}`)
  return res.json() as Promise<WidgetSettings>
}

async function bootstrap(): Promise<void> {
  const host = document.getElementById(WIDGET_HOST_ID)
  if (!host) return

  const slug = host.dataset['restaurant']
  if (!slug) {
    console.error('[restroapi-widget] missing data-restaurant attribute')
    return
  }

  // data-api-base on the host element overrides the build-time env var.
  // This lets the demo page (and any embedder) point at a different backend
  // without rebuilding the script.
  const API_BASE = (host.dataset['apiBase'] ?? ENV_API_BASE).replace(/\/$/, '')

  const { container, shadow } = mountWidgetInShadow(host)

  // Inject base styles into shadow root
  const style = document.createElement('style')
  style.textContent = `
    :host { display: block; width: 100%; height: 100%; }
    * { box-sizing: border-box; }
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 2px; }
    #widget-root { height: 100%; width: 100%; overflow: hidden; position: relative; }
  `
  shadow.insertBefore(style, container)

  const root = createRoot(container)

  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App state="loading" settings={null} apiBase={API_BASE} slug={slug} />
      </QueryClientProvider>
    </StrictMode>,
  )

  try {
    const settings = await fetchSettings(API_BASE, slug)
    injectCssVars(host, settings as Parameters<typeof injectCssVars>[1])
    root.render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <App state="ready" settings={settings} apiBase={API_BASE} slug={slug} />
        </QueryClientProvider>
      </StrictMode>,
    )
  } catch {
    root.render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <App state="error" settings={null} apiBase={API_BASE} slug={slug} />
        </QueryClientProvider>
      </StrictMode>,
    )
  }
}

bootstrap()
