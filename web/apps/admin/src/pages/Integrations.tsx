import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Eye, Monitor, Smartphone, Code2, CheckCircle2, Palette, ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { useApi, API_URL } from '../lib/api'
import { buildEmbedCode, buildPreviewSrcDoc } from '../lib/widgetEmbed'

// ── Live widget preview ────────────────────────────────────────────────────────
//
// Mounts the real widget script against the real restaurant slug/API, inside
// an iframe (isolates the widget's own DOM/CSS from the admin app) — this
// shows the actual live menu and branding, not a static mockup.

function WidgetLivePreview({ slug }: { slug: string }) {
  const srcDoc = buildPreviewSrcDoc(slug, API_URL)
  return (
    <iframe
      title="Widget live preview"
      srcDoc={srcDoc}
      style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
    />
  )
}

// ── Main Integrations page ────────────────────────────────────────────────────

export function Integrations() {
  const api = useApi()
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop')
  const [copied, setCopied] = useState(false)

  const { status, data: restaurant } = useQuery({
    queryKey: ['restaurant'],
    queryFn: () => api.admin.getRestaurant(),
    staleTime: 5 * 60_000,
  })

  if (status === 'pending') return <div className="py-16 text-center text-sm text-gray-400">Loading…</div>
  if (status === 'error' || !restaurant) return <div className="py-16 text-center text-sm text-red-500">Failed to load.</div>

  const embedCode = buildEmbedCode(restaurant.slug)

  async function handleCopy() {
    await navigator.clipboard.writeText(embedCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      {/* Page header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Integrations</h1>
          <p className="mt-1 text-sm text-gray-500">
            Embed the ordering widget on your website and manage connections.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-4 py-1.5">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-xs font-bold tracking-widest text-green-700 uppercase">Widget Status: Active</span>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-6">
        {/* ── Left: Embed ── */}
        <div className="min-w-0 flex-1 space-y-5">
          {/* Embed widget card */}
          <div className="rounded-2xl border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <Code2 size={15} className="text-gray-500" />
                <span className="text-xs font-bold tracking-widest text-gray-700 uppercase">
                  Embed Ordering Widget
                </span>
              </div>
              <span className="rounded-full border border-gray-200 px-3 py-1 text-[10px] font-bold tracking-wider text-gray-400">
                V1.0.0
              </span>
            </div>

            <div className="px-6 py-5">
              <p className="mb-4 text-sm text-gray-600">
                Copy and paste this snippet into your website's HTML before the closing{' '}
                <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-blue-600">{'</body>'}</code>{' '}
                tag.
              </p>

              {/* Code block */}
              <div className="relative mb-4 rounded-xl bg-gray-900 p-5">
                <pre className="overflow-x-auto font-mono text-xs leading-relaxed text-gray-300">
                  {embedCode}
                </pre>
                <button
                  onClick={() => void handleCopy()}
                  className="absolute right-3 top-3 rounded-md bg-white/10 px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-white/20"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          </div>

          {/* Theme colors tip */}
          <Link
            to="/settings?section=profile"
            className="flex items-center gap-4 rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 transition-colors hover:border-blue-200 hover:bg-blue-100"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100">
              <Palette size={18} className="text-blue-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-blue-900">Customize widget theme colors</p>
              <p className="text-xs text-blue-600">
                Brand colors, social links, and delivery partner links are managed in{' '}
                <span className="font-bold">Settings → Restaurant Profile</span>.
              </p>
            </div>
            <ArrowRight size={16} className="shrink-0 text-blue-400" />
          </Link>
        </div>

        {/* ── Right: Live preview ── */}
        <div className="w-96 shrink-0">
          <div className="sticky top-0 rounded-2xl border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <Eye size={15} className="text-blue-500" />
                <span className="text-xs font-bold tracking-widest text-gray-700 uppercase">Live Preview</span>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setPreviewMode('desktop')}
                  className={`rounded-md p-1.5 transition-colors ${previewMode === 'desktop' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
                  aria-label="Desktop preview"
                >
                  <Monitor size={15} />
                </button>
                <button
                  onClick={() => setPreviewMode('mobile')}
                  className={`rounded-md p-1.5 transition-colors ${previewMode === 'mobile' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
                  aria-label="Mobile preview"
                >
                  <Smartphone size={15} />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-center bg-gray-50 p-6">
              <div
                className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
                style={previewMode === 'mobile' ? { width: 320, height: 560 } : { width: '100%', height: 560 }}
              >
                <WidgetLivePreview slug={restaurant.slug} />
              </div>
            </div>

            <div className="flex items-center justify-center gap-6 border-t border-gray-100 px-5 py-3">
              <span className="flex items-center gap-1.5 text-xs text-green-600">
                <CheckCircle2 size={13} />
                Mobile Optimized
              </span>
              <span className="flex items-center gap-1.5 text-xs text-green-600">
                <CheckCircle2 size={13} />
                WCAG 2.1 Compliant
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
