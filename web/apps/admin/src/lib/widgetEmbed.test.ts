import { describe, expect, it } from 'vitest'
import { buildEmbedCode, buildPreviewSrcDoc, WIDGET_EMBED_URL } from './widgetEmbed'

describe('buildEmbedCode', () => {
  it('uses the real widget mount contract: #restroapi-widget host with data-restaurant', () => {
    const code = buildEmbedCode('acme-burgers')
    expect(code).toContain(`<script src="${WIDGET_EMBED_URL}"></script>`)
    expect(code).toContain('id="restroapi-widget"')
    expect(code).toContain('data-restaurant="acme-burgers"')
    // Not a custom element / wrong attribute name — the widget's bootstrap
    // script (main.tsx) reads host.dataset.restaurant, not a <restro-widget>
    // custom element with data-restaurant-slug.
    expect(code).not.toContain('restro-widget')
    expect(code).not.toContain('data-restaurant-slug')
  })
})

describe('buildPreviewSrcDoc', () => {
  it('mounts the real widget host with slug and api base, script after the host element', () => {
    const html = buildPreviewSrcDoc('acme-burgers', 'http://localhost:8789')
    expect(html).toContain('data-restaurant="acme-burgers"')
    expect(html).toContain('data-api-base="http://localhost:8789"')
    // The host div must appear before the script tag in document order —
    // main.tsx's bootstrap() looks up the host synchronously on script load.
    expect(html.indexOf('id="restroapi-widget"')).toBeLessThan(html.indexOf('<script'))
  })
})
