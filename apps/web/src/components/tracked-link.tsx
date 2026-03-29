'use client';

import { usePostHog } from 'posthog-js/react';

interface TrackedLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  event: string;
  properties?: Record<string, string>;
}

export function TrackedLink({ event, properties, children, href, ...props }: TrackedLinkProps) {
  const ph = usePostHog();

  return (
    <a
      href={href}
      {...props}
      onClick={(e) => {
        ph?.capture(event, properties);
        props.onClick?.(e);
      }}
    >
      {children}
    </a>
  );
}
