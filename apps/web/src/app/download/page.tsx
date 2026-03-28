'use client'

import { useEffect } from 'react'
import { usePostHog } from 'posthog-js/react'
import { getVisitorId } from '@/lib/visitor-id'

const GITHUB_RELEASES_URL = 'https://github.com/DaveHudson/Ontograph/releases/latest'

export default function DownloadPage() {
  const ph = usePostHog()

  useEffect(() => {
    const visitorId = getVisitorId()

    ph?.capture(
      'download_initiated',
      {
        visitor_id: visitorId,
        platform: 'web',
        referrer: document.referrer || undefined,
      },
      { send_instantly: true }
    )

    // Set visitor_id as a person property so it can be used
    // to link this web visitor to their desktop app session
    ph?.setPersonProperties({ visitor_id: visitorId })

    const timeout = setTimeout(() => {
      window.location.href = GITHUB_RELEASES_URL
    }, 500)

    return () => clearTimeout(timeout)
  }, [ph])

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-lg font-medium mb-2">Redirecting to download&hellip;</p>
        <p className="text-sm text-muted-foreground">
          If you are not redirected,{' '}
          <a href={GITHUB_RELEASES_URL} className="underline hover:text-foreground transition-colors">
            click here
          </a>
          .
        </p>
      </div>
    </div>
  )
}
