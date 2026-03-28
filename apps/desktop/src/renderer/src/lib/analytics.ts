import posthog from 'posthog-js'

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined
const POSTHOG_HOST = (import.meta.env.VITE_POSTHOG_HOST as string) || 'https://eu.i.posthog.com'

const OPT_OUT_KEY = 'ontograph-analytics-opt-out'

function isOptedOut(): boolean {
  return localStorage.getItem(OPT_OUT_KEY) === 'true'
}

export function initAnalytics(): void {
  if (!POSTHOG_KEY) return

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    persistence: 'localStorage',
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    opt_out_capturing_by_default: isOptedOut()
  })

  if (!isOptedOut()) {
    track('app_launched')
  }
}

export function getAnalyticsOptOut(): boolean {
  return isOptedOut()
}

export function setAnalyticsOptOut(optOut: boolean): void {
  localStorage.setItem(OPT_OUT_KEY, String(optOut))
  if (optOut) {
    posthog.opt_out_capturing()
  } else {
    posthog.opt_in_capturing()
  }
}

export function track(event: string, properties?: Record<string, unknown>): void {
  if (!POSTHOG_KEY || posthog.has_opted_out_capturing()) return
  posthog.capture(event, properties)
}

export function getAnonymousId(): string | undefined {
  if (!POSTHOG_KEY) return undefined
  return posthog.get_distinct_id()
}
