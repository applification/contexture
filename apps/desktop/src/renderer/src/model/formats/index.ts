import type { ParseWarning } from '../quads';
import type { Ontology } from '../types';
import { rdfXmlAdapter } from './rdfxml';
import { turtleAdapter } from './turtle';

export interface ParseResult {
  ontology: Ontology;
  warnings: ParseWarning[];
}

export interface FormatAdapter {
  extensions: string[];
  mimeType: string;
  parse(content: string): ParseResult;
  serialize?(ontology: Ontology): string;
}

const adapters: FormatAdapter[] = [turtleAdapter, rdfXmlAdapter];

export function getAdapterForExtension(ext: string): FormatAdapter | undefined {
  const normalized = ext.toLowerCase().startsWith('.')
    ? ext.toLowerCase()
    : `.${ext.toLowerCase()}`;
  return adapters.find((a) => a.extensions.includes(normalized));
}

export function getAdapterForFilePath(filePath: string): FormatAdapter | undefined {
  const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
  return getAdapterForExtension(ext);
}

export function getAllSupportedExtensions(): string[] {
  return adapters.flatMap((a) => a.extensions);
}

export function getOpenDialogFilters(): { name: string; extensions: string[] }[] {
  const filters: { name: string; extensions: string[] }[] = [];
  const allExts: string[] = [];

  for (const adapter of adapters) {
    const exts = adapter.extensions.map((e) => e.replace(/^\./, ''));
    allExts.push(...exts);
    const name = adapter.mimeType.includes('turtle')
      ? 'Turtle'
      : adapter.mimeType.includes('rdf+xml')
        ? 'RDF/XML'
        : adapter.mimeType;
    filters.push({ name, extensions: exts });
  }

  filters.unshift({ name: 'All Ontology Files', extensions: allExts });
  filters.push({ name: 'All Files', extensions: ['*'] });
  return filters;
}
