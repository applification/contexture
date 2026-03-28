'use client'

import { posthog } from '@/lib/posthog'

interface TrackedLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  event: string
  properties?: Record<string, string>
}

export function TrackedLink({ event, properties, children, ...props }: TrackedLinkProps) {
  return (
    <a
      {...props}
      onClick={(e) => {
        posthog.capture(event, properties)
        props.onClick?.(e)
      }}
    >
      {children}
    </a>
  )
}
