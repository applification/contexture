import { posthog } from './posthog';

const VISITOR_ID_KEY = 'contexture-visitor-id';

export function getVisitorId(): string {
  if (typeof window === 'undefined') return '';

  const stored = localStorage.getItem(VISITOR_ID_KEY);
  if (stored) return stored;

  const id = posthog.get_distinct_id?.() || crypto.randomUUID();
  localStorage.setItem(VISITOR_ID_KEY, id);
  return id;
}
