import posthog from 'posthog-js'

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined
const POSTHOG_HOST = (import.meta.env.VITE_POSTHOG_HOST as string) || 'https://eu.i.posthog.com'

const OPT_OUT_KEY = 'ontograph-analytics-opt-out'
const LINKED_VISITOR_KEY = 'ontograph-linked-visitor-id'

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
    track('app_launched', { platform: 'desktop' })
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

/**
 * Link this desktop session to a website visitor by aliasing PostHog identities.
 * Call this when a shared identifier becomes available (e.g. the visitor_id from
 * the marketing website download flow).
 */
export function linkWebVisitor(webVisitorId: string): void {
  if (!POSTHOG_KEY || !webVisitorId) return

  const alreadyLinked = localStorage.getItem(LINKED_VISITOR_KEY)
  if (alreadyLinked === webVisitorId) return

  posthog.alias(webVisitorId)
  posthog.setPersonProperties({ web_visitor_id: webVisitorId, linked_from: 'desktop' })
  localStorage.setItem(LINKED_VISITOR_KEY, webVisitorId)
}

/**
 * Identify the user with a stable identifier (e.g. email).
 * This merges the anonymous desktop session with any web session
 * that used the same identifier.
 */
export function identifyUser(userId: string, properties?: Record<string, string>): void {
  if (!POSTHOG_KEY || !userId) return
  posthog.identify(userId, properties)
}
