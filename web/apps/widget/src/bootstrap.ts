import type { WidgetSettings } from './types'

export const WIDGET_HOST_ID = 'restroapi-widget'

export function injectCssVars(host: HTMLElement, settings: WidgetSettings): void {
  const colors = settings.brand_colors
  if (colors?.primary)   host.style.setProperty('--brand-primary',   colors.primary)
  if (colors?.secondary) host.style.setProperty('--brand-secondary', colors.secondary)
  if (colors?.accent)    host.style.setProperty('--brand-accent',    colors.accent)
  if (colors?.text)      host.style.setProperty('--brand-text',      colors.text)
  if (settings.font_family) host.style.setProperty('--font-family',  settings.font_family)
}

export function mountWidgetInShadow(host: HTMLElement): { container: HTMLDivElement; shadow: ShadowRoot } {
  const shadow = host.attachShadow({ mode: 'open' })
  const container = document.createElement('div')
  container.id = 'widget-root'
  shadow.appendChild(container)
  return { container, shadow }
}
