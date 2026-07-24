// The widget script's src is configurable via env var (defaulting to the
// production CDN) so a local build can point this at a locally-built
// dist/embed.js (or a static server serving it) without a code change —
// same idea as web/apps/widget/demo.html's source toggle, just build-time
// instead of runtime.
export const WIDGET_EMBED_URL =
  (import.meta.env.VITE_WIDGET_EMBED_URL as string | undefined) ?? 'https://cdn.restroapi.com/widget.js'

/**
 * The exact embed snippet restaurant owners copy onto their site. Must match
 * the real mount contract the widget's bootstrap script reads
 * (web/apps/widget/src/main.tsx: `#restroapi-widget` host element with
 * `data-restaurant`, optionally `data-api-base`) — not a custom element.
 */
export function buildEmbedCode(slug: string): string {
  return `<script src="${WIDGET_EMBED_URL}"></script>\n<div id="restroapi-widget" data-restaurant="${slug}"></div>`
}

/**
 * HTML for the live-preview iframe's `srcDoc` — mounts the real widget
 * script against the real restaurant slug and API base, so the preview
 * reflects actual menu/branding instead of a static mockup.
 */
export function buildPreviewSrcDoc(slug: string, apiBase: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>html,body{margin:0;height:100%;background:#fff;}</style>
</head>
<body>
<div id="restroapi-widget" data-restaurant="${slug}" data-api-base="${apiBase}" style="height:100%;width:100%;"></div>
<script src="${WIDGET_EMBED_URL}"></script>
</body>
</html>`
}
