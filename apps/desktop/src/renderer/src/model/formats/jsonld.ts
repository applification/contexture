import jsonld from 'jsonld';
import { DataFactory, Parser, type Quad, Writer } from 'n3';
import { type ParseWarning, walkQuads } from '../quads';
import type { Ontology } from '../types';
import { createEmptyOntology } from '../types';
import type { FormatAdapter, ParseResult } from './index';

const { namedNode, literal, quad: q } = DataFactory;

const OWL = 'http://www.w3.org/2002/07/owl#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const XSD = 'http://www.w3.org/2001/XMLSchema#';

async function parseJsonLdAsync(content: string): Promise<ParseResult> {
  const warnings: ParseWarning[] = [];

  let doc: unknown;
  try {
    doc = JSON.parse(content);
  } catch (e) {
    warnings.push({ severity: 'error', message: `JSON-LD parse error: ${(e as Error).message}` });
    return { ontology: createEmptyOntology(), warnings };
  }

  let nquads: string;
  try {
    nquads = (await jsonld.toRDF(doc as jsonld.JsonLdDocument, {
      format: 'application/n-quads',
    })) as string;
  } catch (e) {
    warnings.push({
      severity: 'error',
      message: `JSON-LD to RDF conversion error: ${(e as Error).message}`,
    });
    return { ontology: createEmptyOntology(), warnings };
  }

  const quads: Quad[] = [];
  const prefixes = new Map<string, string>();

  await new Promise<void>((resolve, reject) => {
    const parser = new Parser({ format: 'N-Quads' });
    parser.parse(nquads, (error, quad) => {
      if (error) {
        reject(error);
        return;
      }
      if (quad) {
        quads.push(quad);
      } else {
        resolve();
      }
    });
  });

  const result = walkQuads(quads, prefixes);
  result.warnings.unshift(...warnings);
  return result;
}

function buildNQuads(ontology: Ontology): Promise<string> {
  return new Promise((resolve, reject) => {
    const writer = new Writer({ format: 'N-Quads' });

    const nn = namedNode;
    const strLit = (val: string) => literal(val, nn(`${XSD}string`));

    function t(s: string, p: string, o: string) {
      writer.addQuad(q(nn(s), nn(p), nn(o)));
    }
    function tLit(s: string, p: string, val: string, dt?: string) {
      writer.addQuad(q(nn(s), nn(p), dt ? literal(val, nn(dt)) : strLit(val)));
    }

    if (ontology.ontologyMetadata) {
      const meta = ontology.ontologyMetadata;
      t(meta.iri, `${RDF}type`, `${OWL}Ontology`);
      if (meta.versionIRI) t(meta.iri, `${OWL}versionIRI`, meta.versionIRI);
      for (const imp of meta.imports) t(meta.iri, `${OWL}imports`, imp);
      for (const ann of meta.annotations) {
        tLit(meta.iri, ann.property, ann.value, ann.datatype ?? `${XSD}string`);
      }
    }

    for (const cls of ontology.classes.values()) {
      t(cls.uri, `${RDF}type`, `${OWL}Class`);
      if (cls.label) tLit(cls.uri, `${RDFS}label`, cls.label);
      if (cls.comment) tLit(cls.uri, `${RDFS}comment`, cls.comment);
      for (const parent of cls.subClassOf) t(cls.uri, `${RDFS}subClassOf`, parent);
      for (const disjoint of cls.disjointWith) t(cls.uri, `${OWL}disjointWith`, disjoint);
    }

    for (const prop of ontology.objectProperties.values()) {
      t(prop.uri, `${RDF}type`, `${OWL}ObjectProperty`);
      if (prop.label) tLit(prop.uri, `${RDFS}label`, prop.label);
      if (prop.comment) tLit(prop.uri, `${RDFS}comment`, prop.comment);
      for (const d of prop.domain) t(prop.uri, `${RDFS}domain`, d);
      for (const r of prop.range) t(prop.uri, `${RDFS}range`, r);
      if (prop.inverseOf) t(prop.uri, `${OWL}inverseOf`, prop.inverseOf);
    }

    for (const prop of ontology.datatypeProperties.values()) {
      t(prop.uri, `${RDF}type`, `${OWL}DatatypeProperty`);
      if (prop.label) tLit(prop.uri, `${RDFS}label`, prop.label);
      if (prop.comment) tLit(prop.uri, `${RDFS}comment`, prop.comment);
      for (const d of prop.domain) t(prop.uri, `${RDFS}domain`, d);
      if (prop.range) t(prop.uri, `${RDFS}range`, prop.range);
    }

    for (const prop of ontology.annotationProperties.values()) {
      t(prop.uri, `${RDF}type`, `${OWL}AnnotationProperty`);
      if (prop.label) tLit(prop.uri, `${RDFS}label`, prop.label);
      if (prop.comment) tLit(prop.uri, `${RDFS}comment`, prop.comment);
      for (const parent of prop.subPropertyOf) t(prop.uri, `${RDFS}subPropertyOf`, parent);
    }

    for (const ind of ontology.individuals.values()) {
      t(ind.uri, `${RDF}type`, `${OWL}NamedIndividual`);
      for (const typeUri of ind.types) t(ind.uri, `${RDF}type`, typeUri);
      if (ind.label) tLit(ind.uri, `${RDFS}label`, ind.label);
      if (ind.comment) tLit(ind.uri, `${RDFS}comment`, ind.comment);
      for (const a of ind.objectPropertyAssertions) t(ind.uri, a.property, a.target);
      for (const a of ind.dataPropertyAssertions) {
        tLit(ind.uri, a.property, a.value, a.datatype);
      }
    }

    writer.end((err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

async function serializeToJsonLdAsync(ontology: Ontology): Promise<string> {
  const nquads = await buildNQuads(ontology);

  const doc = await jsonld.fromRDF(nquads as unknown as jsonld.JsonLdDocument, {
    format: 'application/n-quads',
  });

  const context: Record<string, string> = {
    owl: OWL,
    rdf: RDF,
    rdfs: RDFS,
    xsd: XSD,
  };
  for (const [prefix, ns] of ontology.prefixes) {
    if (!context[prefix]) context[prefix] = ns;
  }

  const compacted = await jsonld.compact(doc, context);
  return JSON.stringify(compacted, null, 2);
}

export const jsonLdAdapter: FormatAdapter = {
  extensions: ['.jsonld'],
  mimeType: 'application/ld+json',
  parse(_content: string): ParseResult {
    return {
      ontology: createEmptyOntology(),
      warnings: [{ severity: 'error', message: 'JSON-LD parsing requires async - use parseAsync' }],
    };
  },
  parseAsync: parseJsonLdAsync,
  serializeAsync: serializeToJsonLdAsync,
};
