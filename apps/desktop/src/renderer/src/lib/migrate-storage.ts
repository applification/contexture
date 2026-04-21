/**
 * One-shot migration of localStorage keys from the Ontograph name to Contexture.
 *
 * Legacy Ontograph users who launch the first Contexture build still have their
 * settings under the old `ontograph-*` keys. On first run we copy each known key
 * over to its `contexture-*` counterpart and delete the original, so subsequent
 * launches read the new keys directly. Safe to run every boot — the loop only
 * migrates keys that still exist.
 */

const KEY_MAP: Readonly<Record<string, string>> = {
  'ontograph-api-key': 'contexture-api-key',
  'ontograph-auth-mode': 'contexture-auth-mode',
  'ontograph-model': 'contexture-model',
  'ontograph-thinking-budget': 'contexture-thinking-budget',
  'ontograph-tracked-first-message': 'contexture-tracked-first-message',
  'ontograph-chat-threads': 'contexture-chat-threads',
  'ontograph-active-thread': 'contexture-active-thread',
  'ontograph-analytics-opt-out': 'contexture-analytics-opt-out',
  'ontograph-linked-visitor-id': 'contexture-linked-visitor-id',
};

export function migrateLegacyStorageKeys(): void {
  if (typeof localStorage === 'undefined') return;

  for (const [oldKey, newKey] of Object.entries(KEY_MAP)) {
    const legacy = localStorage.getItem(oldKey);
    if (legacy === null) continue;
    // Don't overwrite a value the user has already set under the new key.
    if (localStorage.getItem(newKey) === null) {
      localStorage.setItem(newKey, legacy);
    }
    localStorage.removeItem(oldKey);
  }
}
