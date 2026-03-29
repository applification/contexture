/**
 * Approximate token count for Claude models.
 * Uses a simple heuristic: ~4 characters per token for English text.
 * This is a rough estimate — the actual tokenizer is not available in the browser.
 * For Turtle/RDF content, the ratio is closer to 3.5 chars/token due to URIs.
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  // Rough heuristic: split on whitespace and punctuation boundaries
  // Average ~3.5 chars per token for technical/RDF content
  return Math.ceil(text.length / 3.5);
}
