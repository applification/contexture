import { posthog } from './posthog';

const UTM_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;

export function captureAttribution() {
  if (typeof window === 'undefined') return;

  const params = new URLSearchParams(window.location.search);
  const utms: Record<string, string> = {};

  for (const key of UTM_PARAMS) {
    const value = params.get(key);
    if (value) utms[key] = value;
  }

  const referrer = document.referrer || null;
  const landingPage = window.location.pathname;
  const hasUtms = Object.keys(utms).length > 0;

  if (hasUtms || referrer) {
    const properties: Record<string, string> = {
      ...utms,
      landing_page: landingPage,
    };
    if (referrer) properties.referrer = referrer;

    posthog.register(properties);

    const personProps: Record<string, string> = {};
    if (utms.utm_source) personProps.first_touch_source = utms.utm_source;
    if (utms.utm_medium) personProps.first_touch_medium = utms.utm_medium;
    if (utms.utm_campaign) personProps.first_touch_campaign = utms.utm_campaign;

    if (Object.keys(personProps).length > 0) {
      posthog.setPersonPropertiesForFlags(personProps);
    }
  }
}
