/**
 * Approximate token count for Claude models.
 * Uses a simple heuristic: ~3.5 characters per token for technical/code content.
 * This is a rough estimate — the actual tokenizer is not available in the browser.
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  // Rough heuristic: split on whitespace and punctuation boundaries
  return Math.ceil(text.length / 3.5);
}
