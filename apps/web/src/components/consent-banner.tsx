'use client'

import { useState, useEffect } from 'react'
import { posthog } from '@/lib/posthog'

const CONSENT_KEY = 'ontograph-analytics-consent'

type ConsentState = 'granted' | 'denied' | null

function getStoredConsent(): ConsentState {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(CONSENT_KEY) as ConsentState
}

export function ConsentBanner() {
  const [consent, setConsent] = useState<ConsentState>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const stored = getStoredConsent()
    setConsent(stored)
    if (!stored) setVisible(true)
  }, [])

  useEffect(() => {
    if (consent === 'denied') {
      posthog.opt_out_capturing()
    } else if (consent === 'granted') {
      posthog.opt_in_capturing()
    }
  }, [consent])

  function accept() {
    localStorage.setItem(CONSENT_KEY, 'granted')
    setConsent('granted')
    setVisible(false)
  }

  function decline() {
    localStorage.setItem(CONSENT_KEY, 'denied')
    setConsent('denied')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-50 rounded-xl border border-border bg-card p-4 shadow-lg">
      <p className="text-sm text-muted-foreground mb-3">
        We use privacy-friendly analytics to improve Ontograph. No personal data is collected.
      </p>
      <div className="flex gap-2">
        <button
          onClick={accept}
          className="flex-1 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Accept
        </button>
        <button
          onClick={decline}
          className="flex-1 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Decline
        </button>
      </div>
    </div>
  )
}
