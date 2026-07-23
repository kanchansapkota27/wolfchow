import { useEffect, useState } from 'react'
import type { WidgetSettings } from './types'

/** Standard mobile breakpoint used for menu_image_display device targeting. */
export const MOBILE_BREAKPOINT_PX = 768

export function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.innerWidth <= MOBILE_BREAKPOINT_PX
}

/** Tracks the mobile/desktop viewport split, updating on resize (e.g. a responsive embed). */
export function useIsMobileViewport(): boolean {
  const [isMobile, setIsMobile] = useState(isMobileViewport)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return

    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`)
    const update = () => setIsMobile(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [])

  return isMobile
}

/**
 * Whether menu item photos should render, combining the menu_photos plan
 * flag (can this restaurant show photos at all) with the restaurant's own
 * menu_image_display device-scope preference.
 */
export function shouldShowMenuImages(settings: WidgetSettings, isMobile: boolean): boolean {
  if (!settings.features.menu_photos) return false
  switch (settings.menu_image_display) {
    case 'off': return false
    case 'both': return true
    case 'mobile': return isMobile
    case 'desktop': return !isMobile
    default: return true
  }
}
