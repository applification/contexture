import posthog from "posthog-js";

export function initPostHog() {
  if (typeof window === "undefined") return;
  if (posthog.__loaded) return;

  const key = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";

  if (!key) return;
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") return;

  posthog.init(key, {
    api_host: host,
    person_profiles: "identified_only",
    persistence: "memory",
    capture_pageview: false,
    capture_pageleave: false,
    opt_out_capturing_by_default: true,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "*",
    },
    autocapture: false,
    disable_cookie: true,
    defaults: "2026-01-30",
  });
}

export { posthog };
