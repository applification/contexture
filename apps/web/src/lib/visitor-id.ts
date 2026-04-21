import { posthog } from './posthog';

const VISITOR_ID_KEY = 'contexture-visitor-id';
const LEGACY_VISITOR_ID_KEY = 'ontograph-visitor-id';

export function getVisitorId(): string {
  if (typeof window === 'undefined') return '';

  const stored = localStorage.getItem(VISITOR_ID_KEY);
  if (stored) return stored;

  // One-shot migration from the Ontograph-era key.
  const legacy = localStorage.getItem(LEGACY_VISITOR_ID_KEY);
  if (legacy) {
    localStorage.setItem(VISITOR_ID_KEY, legacy);
    localStorage.removeItem(LEGACY_VISITOR_ID_KEY);
    return legacy;
  }

  const id = posthog.get_distinct_id?.() || crypto.randomUUID();
  localStorage.setItem(VISITOR_ID_KEY, id);
  return id;
}
