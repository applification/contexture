import { Parser, type Quad } from 'n3'
import type { Ontology, OntologyClass, ObjectProperty, DatatypeProperty } from './types'
import { createEmptyOntology } from './types'

const OWL = 'http://www.w3.org/2002/07/owl#'
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#'
const XSD = 'http://www.w3.org/2001/XMLSchema#'

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
  `${XSD}positiveInteger`
])

function isDatatypeURI(uri: string): boolean {
  return XSD_DATATYPES.has(uri) || uri.startsWith(XSD)
}

function getOrCreateClass(ontology: Ontology, uri: string): OntologyClass {
  let cls = ontology.classes.get(uri)
  if (!cls) {
    cls = { uri, subClassOf: [], disjointWith: [] }
    ontology.classes.set(uri, cls)
  }
  return cls
}

function getOrCreateObjectProperty(ontology: Ontology, uri: string): ObjectProperty {
  let prop = ontology.objectProperties.get(uri)
  if (!prop) {
    prop = { uri, domain: [], range: [] }
    ontology.objectProperties.set(uri, prop)
  }
  return prop
}

function getOrCreateDatatypeProperty(ontology: Ontology, uri: string): DatatypeProperty {
  let prop = ontology.datatypeProperties.get(uri)
  if (!prop) {
    prop = { uri, domain: [], range: `${XSD}string` }
    ontology.datatypeProperties.set(uri, prop)
  }
  return prop
}

export function parseTurtle(turtle: string): Ontology {
  const parser = new Parser()
  const quads: Quad[] = parser.parse(turtle)
  const ontology = createEmptyOntology()

  // Merge prefixes from parser
  const prefixes = (parser as unknown as { _prefixes: Record<string, string> })._prefixes
  if (prefixes) {
    for (const [prefix, iri] of Object.entries(prefixes)) {
      if (prefix) ontology.prefixes.set(prefix, iri)
    }
  }

  // Track declared types to distinguish ObjectProperty from DatatypeProperty
  const declaredTypes = new Map<string, string>()

  // First pass: collect type declarations
  for (const quad of quads) {
    const s = quad.subject.value
    const p = quad.predicate.value
    const o = quad.object.value

    if (p === `${RDF}type`) {
      declaredTypes.set(s, o)

      if (o === `${OWL}Class`) {
        getOrCreateClass(ontology, s)
      } else if (o === `${OWL}ObjectProperty`) {
        getOrCreateObjectProperty(ontology, s)
      } else if (o === `${OWL}DatatypeProperty`) {
        getOrCreateDatatypeProperty(ontology, s)
      }
    }
  }

  // Second pass: process properties and relationships
  for (const quad of quads) {
    const s = quad.subject.value
    const p = quad.predicate.value
    const o = quad.object.value

    if (p === `${RDF}type`) continue

    if (p === `${RDFS}label`) {
      const literal = quad.object.termType === 'Literal' ? quad.object.value : o
      if (ontology.classes.has(s)) {
        ontology.classes.get(s)!.label = literal
      } else if (ontology.objectProperties.has(s)) {
        ontology.objectProperties.get(s)!.label = literal
      } else if (ontology.datatypeProperties.has(s)) {
        ontology.datatypeProperties.get(s)!.label = literal
      }
      continue
    }

    if (p === `${RDFS}comment`) {
      const literal = quad.object.termType === 'Literal' ? quad.object.value : o
      if (ontology.classes.has(s)) {
        ontology.classes.get(s)!.comment = literal
      } else if (ontology.objectProperties.has(s)) {
        ontology.objectProperties.get(s)!.comment = literal
      } else if (ontology.datatypeProperties.has(s)) {
        ontology.datatypeProperties.get(s)!.comment = literal
      }
      continue
    }

    if (p === `${RDFS}subClassOf`) {
      const cls = getOrCreateClass(ontology, s)
      getOrCreateClass(ontology, o)
      if (!cls.subClassOf.includes(o)) {
        cls.subClassOf.push(o)
      }
      continue
    }

    if (p === `${OWL}disjointWith`) {
      const cls = getOrCreateClass(ontology, s)
      if (!cls.disjointWith.includes(o)) {
        cls.disjointWith.push(o)
      }
      continue
    }

    if (p === `${RDFS}domain`) {
      getOrCreateClass(ontology, o)
      if (ontology.objectProperties.has(s)) {
        const prop = ontology.objectProperties.get(s)!
        if (!prop.domain.includes(o)) prop.domain.push(o)
      } else if (ontology.datatypeProperties.has(s)) {
        const prop = ontology.datatypeProperties.get(s)!
        if (!prop.domain.includes(o)) prop.domain.push(o)
      }
      continue
    }

    if (p === `${RDFS}range`) {
      if (ontology.objectProperties.has(s)) {
        const prop = ontology.objectProperties.get(s)!
        getOrCreateClass(ontology, o)
        if (!prop.range.includes(o)) prop.range.push(o)
      } else if (ontology.datatypeProperties.has(s)) {
        ontology.datatypeProperties.get(s)!.range = o
      } else if (isDatatypeURI(o)) {
        // Undeclared property with datatype range — treat as DatatypeProperty
        const prop = getOrCreateDatatypeProperty(ontology, s)
        prop.range = o
      }
      continue
    }

    if (p === `${OWL}inverseOf`) {
      if (ontology.objectProperties.has(s)) {
        ontology.objectProperties.get(s)!.inverseOf = o
      }
      continue
    }
  }

  return ontology
}
