import bundleAnalyzer from '@next/bundle-analyzer';
import { withSentryConfig } from '@sentry/nextjs';
import { varlockNextConfigPlugin } from '@varlock/nextjs-integration/plugin';
import type { NextConfig } from 'next';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const isProduction = process.env.NODE_ENV === 'production';

const scriptSrc = [
  "script-src 'self' 'unsafe-inline'",
  isProduction ? null : "'unsafe-eval'",
  'https://*.i.posthog.com',
]
  .filter((source): source is string => source !== null)
  .join(' ');

const contentSecurityPolicy = [
  "default-src 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  isProduction ? "connect-src 'self' https:" : "connect-src 'self' http: https: ws: wss:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  isProduction ? 'upgrade-insecure-requests' : null,
]
  .filter((directive): directive is string => directive !== null)
  .join('; ');

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: contentSecurityPolicy,
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ['*.web.localhost'],
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        source: '/:path*.(ico|png|svg|woff2)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

export default varlockNextConfigPlugin()(
  withSentryConfig(withBundleAnalyzer(nextConfig), {
    silent: true,
    disableLogger: true,
  }),
);
