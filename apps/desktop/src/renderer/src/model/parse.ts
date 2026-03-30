import { Parser, type Quad } from 'n3';
import type {
  DatatypeProperty,
  Individual,
  ObjectProperty,
  Ontology,
  OntologyClass,
  Restriction,
  RestrictionType,
} from './types';
import { createEmptyOntology } from './types';

const OWL = 'http://www.w3.org/2002/07/owl#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const XSD = 'http://www.w3.org/2001/XMLSchema#';

const XSD_DATATYPES = new Set([
  `${XSD}string`,
  `${XSD}integer`,
  `${XSD}int`,
  `${XSD}long`,
  `${XSD}short`,
  `${XSD}byte`,
  `${XSD}float`,
  `${XSD}double`,
  `${XSD}decimal`,
  `${XSD}boolean`,
  `${XSD}date`,
  `${XSD}dateTime`,
  `${XSD}time`,
  `${XSD}anyURI`,
  `${XSD}nonNegativeInteger`,
  `${XSD}positiveInteger`,
]);

function isDatatypeURI(uri: string): boolean {
  return XSD_DATATYPES.has(uri) || uri.startsWith(XSD);
}

function getOrCreateClass(ontology: Ontology, uri: string): OntologyClass {
  let cls = ontology.classes.get(uri);
  if (!cls) {
    cls = { uri, subClassOf: [], disjointWith: [] };
    ontology.classes.set(uri, cls);
  }
  return cls;
}

function getOrCreateObjectProperty(ontology: Ontology, uri: string): ObjectProperty {
  let prop = ontology.objectProperties.get(uri);
  if (!prop) {
    prop = { uri, domain: [], range: [] };
    ontology.objectProperties.set(uri, prop);
  }
  return prop;
}

function getOrCreateDatatypeProperty(ontology: Ontology, uri: string): DatatypeProperty {
  let prop = ontology.datatypeProperties.get(uri);
  if (!prop) {
    prop = { uri, domain: [], range: `${XSD}string` };
    ontology.datatypeProperties.set(uri, prop);
  }
  return prop;
}

function getOrCreateIndividual(ontology: Ontology, uri: string): Individual {
  let ind = ontology.individuals.get(uri);
  if (!ind) {
    ind = { uri, types: [], objectPropertyAssertions: [], dataPropertyAssertions: [] };
    ontology.individuals.set(uri, ind);
  }
  return ind;
}

export interface ParseWarning {
  message: string;
  severity: 'error' | 'warning';
}

export interface ParseResult {
  ontology: Ontology;
  warnings: ParseWarning[];
}

export function parseTurtle(turtle: string): Ontology {
  return parseTurtleWithWarnings(turtle).ontology;
}

export function parseTurtleWithWarnings(turtle: string): ParseResult {
  const warnings: ParseWarning[] = [];
  let quads: Quad[];
  let prefixes: Record<string, string> | undefined;

  try {
    const parser = new Parser();
    quads = parser.parse(turtle);

    // Merge prefixes from parser
    prefixes = (parser as unknown as { _prefixes: Record<string, string> })._prefixes;
  } catch (err: unknown) {
    warnings.push({
      severity: 'error',
      message: `Turtle parse error: ${(err as Error).message}`,
    });
    return { ontology: createEmptyOntology(), warnings };
  }

  const ontology = createEmptyOntology();

  if (prefixes) {
    for (const [prefix, iri] of Object.entries(prefixes)) {
      if (prefix) ontology.prefixes.set(prefix, iri);
    }
  }

  // Track declared types to distinguish ObjectProperty from DatatypeProperty
  const declaredTypes = new Map<string, Set<string>>();

  // First pass: collect type declarations
  for (const quad of quads) {
    const s = quad.subject.value;
    const p = quad.predicate.value;
    const o = quad.object.value;

    if (p === `${RDF}type`) {
      if (!declaredTypes.has(s)) declaredTypes.set(s, new Set());
      declaredTypes.get(s)?.add(o);

      if (o === `${OWL}Class`) {
        getOrCreateClass(ontology, s);
      } else if (o === `${OWL}ObjectProperty`) {
        getOrCreateObjectProperty(ontology, s);
      } else if (o === `${OWL}DatatypeProperty`) {
        getOrCreateDatatypeProperty(ontology, s);
      } else if (o === `${OWL}NamedIndividual`) {
        // Skip blank node individuals
        if (quad.subject.termType === 'BlankNode') {
          warnings.push({
            severity: 'warning',
            message: `Blank node individual ignored: ${s}`,
          });
        } else {
          getOrCreateIndividual(ontology, s);
        }
      }
    }
  }

  // Restriction pass: collect blank nodes typed as owl:Restriction
  const restrictionBlankNodes = new Set<string>();
  const restrictionProps = new Map<
    string,
    { onProperty?: string; type?: RestrictionType; value?: string }
  >();

  const RESTRICTION_VALUE_PREDICATES: Record<string, RestrictionType> = {
    [`${OWL}someValuesFrom`]: 'someValuesFrom',
    [`${OWL}allValuesFrom`]: 'allValuesFrom',
    [`${OWL}hasValue`]: 'hasValue',
    [`${OWL}minCardinality`]: 'minCardinality',
    [`${OWL}maxCardinality`]: 'maxCardinality',
    [`${OWL}cardinality`]: 'exactCardinality',
    [`${OWL}minQualifiedCardinality`]: 'minCardinality',
    [`${OWL}maxQualifiedCardinality`]: 'maxCardinality',
    [`${OWL}qualifiedCardinality`]: 'exactCardinality',
  };

  for (const quad of quads) {
    const s = quad.subject.value;
    const p = quad.predicate.value;
    const o = quad.object.value;

    if (p === `${RDF}type` && o === `${OWL}Restriction`) {
      restrictionBlankNodes.add(s);
      if (!restrictionProps.has(s)) restrictionProps.set(s, {});
    }

    if (p === `${OWL}onProperty`) {
      const entry = restrictionProps.get(s) ?? {};
      entry.onProperty = o;
      restrictionProps.set(s, entry);
    }

    const rType = RESTRICTION_VALUE_PREDICATES[p];
    if (rType) {
      const entry = restrictionProps.get(s) ?? {};
      entry.type = rType;
      entry.value = o;
      restrictionProps.set(s, entry);
    }
  }

  // Second pass: process properties and relationships
  for (const quad of quads) {
    const s = quad.subject.value;
    const p = quad.predicate.value;
    const o = quad.object.value;

    if (p === `${RDF}type`) {
      // Record type assertions for individuals (e.g., :john rdf:type :Person)
      const ind = ontology.individuals.get(s);
      if (ind && o !== `${OWL}NamedIndividual`) {
        if (!ind.types.includes(o)) ind.types.push(o);
      }
      continue;
    }

    if (p === `${RDFS}label`) {
      const literal = quad.object.termType === 'Literal' ? quad.object.value : o;
      const cls = ontology.classes.get(s);
      const objProp = ontology.objectProperties.get(s);
      const dtProp = ontology.datatypeProperties.get(s);
      const ind = ontology.individuals.get(s);
      if (cls) {
        cls.label = literal;
      } else if (objProp) {
        objProp.label = literal;
      } else if (dtProp) {
        dtProp.label = literal;
      } else if (ind) {
        ind.label = literal;
      }
      continue;
    }

    if (p === `${RDFS}comment`) {
      const literal = quad.object.termType === 'Literal' ? quad.object.value : o;
      const cls = ontology.classes.get(s);
      const objProp = ontology.objectProperties.get(s);
      const dtProp = ontology.datatypeProperties.get(s);
      const ind = ontology.individuals.get(s);
      if (cls) {
        cls.comment = literal;
      } else if (objProp) {
        objProp.comment = literal;
      } else if (dtProp) {
        dtProp.comment = literal;
      } else if (ind) {
        ind.comment = literal;
      }
      continue;
    }

    if (p === `${RDFS}subClassOf`) {
      if (restrictionBlankNodes.has(o)) {
        const rData = restrictionProps.get(o);
        if (!rData?.onProperty) {
          warnings.push({
            severity: 'warning',
            message: `Restriction on ${s} missing owl:onProperty — skipped`,
          });
          continue;
        }
        if (rData.type && rData.value !== undefined) {
          const cls = getOrCreateClass(ontology, s);
          const restriction: Restriction = {
            onProperty: rData.onProperty,
            type: rData.type,
            value: rData.value,
          };
          if (!cls.restrictions) cls.restrictions = [];
          cls.restrictions.push(restriction);
        }
        continue;
      }
      const cls = getOrCreateClass(ontology, s);
      getOrCreateClass(ontology, o);
      if (!cls.subClassOf.includes(o)) {
        cls.subClassOf.push(o);
      }
      continue;
    }

    if (p === `${OWL}disjointWith`) {
      const cls = getOrCreateClass(ontology, s);
      if (!cls.disjointWith.includes(o)) {
        cls.disjointWith.push(o);
      }
      continue;
    }

    if (p === `${RDFS}domain`) {
      getOrCreateClass(ontology, o);
      const objProp = ontology.objectProperties.get(s);
      const dtProp = ontology.datatypeProperties.get(s);
      if (objProp) {
        if (!objProp.domain.includes(o)) objProp.domain.push(o);
      } else if (dtProp) {
        if (!dtProp.domain.includes(o)) dtProp.domain.push(o);
      }
      continue;
    }

    if (p === `${RDFS}range`) {
      const objProp = ontology.objectProperties.get(s);
      const dtProp = ontology.datatypeProperties.get(s);
      if (objProp) {
        getOrCreateClass(ontology, o);
        if (!objProp.range.includes(o)) objProp.range.push(o);
      } else if (dtProp) {
        dtProp.range = o;
      } else if (isDatatypeURI(o)) {
        // Undeclared property with datatype range — treat as DatatypeProperty
        const prop = getOrCreateDatatypeProperty(ontology, s);
        prop.range = o;
      }
      continue;
    }

    if (p === `${OWL}inverseOf`) {
      const prop = ontology.objectProperties.get(s);
      if (prop) {
        prop.inverseOf = o;
      }
      continue;
    }

    // Individual property assertions
    const ind = ontology.individuals.get(s);
    if (ind) {
      if (quad.object.termType === 'Literal') {
        const datatype = (quad.object as { datatype?: { value: string } }).datatype?.value;
        ind.dataPropertyAssertions.push({
          property: p,
          value: o,
          datatype: datatype || undefined,
        });
      } else if (quad.object.termType === 'NamedNode') {
        ind.objectPropertyAssertions.push({ property: p, target: o });
      }
    }
  }

  // Detect unsupported OWL constructs
  const unsupported = new Set<string>();
  const UNSUPPORTED_TYPES = [`${OWL}AllDifferent`, `${OWL}AnnotationProperty`, `${OWL}Ontology`];
  for (const quad of quads) {
    if (quad.predicate.value === `${RDF}type` && UNSUPPORTED_TYPES.includes(quad.object.value)) {
      const name = quad.object.value.split('#').pop() || quad.object.value;
      unsupported.add(name);
    }
  }
  if (unsupported.size > 0) {
    warnings.push({
      severity: 'warning',
      message: `Unsupported OWL constructs ignored: ${[...unsupported].join(', ')}`,
    });
  }

  if (
    ontology.classes.size === 0 &&
    ontology.objectProperties.size === 0 &&
    ontology.datatypeProperties.size === 0 &&
    ontology.individuals.size === 0
  ) {
    warnings.push({
      severity: 'warning',
      message: 'No OWL classes or properties found in this file',
    });
  }

  return { ontology, warnings };
}
