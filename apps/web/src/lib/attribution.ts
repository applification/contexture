import { posthog } from './posthog'

const UTM_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const

export function captureAttribution() {
  if (typeof window === 'undefined') return

  const params = new URLSearchParams(window.location.search)
  const utms: Record<string, string> = {}

  for (const key of UTM_PARAMS) {
    const value = params.get(key)
    if (value) utms[key] = value
  }

  const referrer = document.referrer || undefined
  const landingPage = window.location.pathname

  if (Object.keys(utms).length > 0 || referrer) {
    posthog.register({
      ...utms,
      referrer,
      landing_page: landingPage,
    })

    posthog.setPersonPropertiesForFlags({
      first_touch_source: utms.utm_source,
      first_touch_medium: utms.utm_medium,
      first_touch_campaign: utms.utm_campaign,
    })
  }
}
