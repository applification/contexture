import { createEmptyOntology } from '../types';
import type { FormatAdapter, ParseResult } from './index';

export const jsonLdAdapter: FormatAdapter = {
  extensions: ['.jsonld'],
  mimeType: 'application/ld+json',
  parse(_content: string): ParseResult {
    return {
      ontology: createEmptyOntology(),
      warnings: [
        {
          severity: 'error',
          message: 'JSON-LD parsing is not yet implemented',
        },
      ],
    };
  },
};
