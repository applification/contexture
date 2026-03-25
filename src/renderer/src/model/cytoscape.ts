import type { Ontology } from './types'

export interface CytoscapeNode {
  data: {
    id: string
    label: string
    type: 'class'
    comment?: string
    datatypeProperties: { uri: string; label: string; range: string }[]
    parent?: string
  }
}

export interface CytoscapeEdge {
  data: {
    id: string
    source: string
    target: string
    label: string
    type: 'objectProperty' | 'subClassOf' | 'disjointWith'
    uri?: string
  }
}

export type CytoscapeElement = CytoscapeNode | CytoscapeEdge

function localName(uri: string): string {
  const hash = uri.lastIndexOf('#')
  const slash = uri.lastIndexOf('/')
  const idx = Math.max(hash, slash)
  return idx >= 0 ? uri.substring(idx + 1) : uri
}

export function ontologyToCytoscapeElements(ontology: Ontology): CytoscapeElement[] {
  const elements: CytoscapeElement[] = []

  // Build a map of datatype properties grouped by domain class
  const dtPropsByDomain = new Map<string, { uri: string; label: string; range: string }[]>()
  for (const prop of ontology.datatypeProperties.values()) {
    const label = prop.label || localName(prop.uri)
    const range = localName(prop.range)
    for (const domainUri of prop.domain) {
      if (!dtPropsByDomain.has(domainUri)) {
        dtPropsByDomain.set(domainUri, [])
      }
      dtPropsByDomain.get(domainUri)!.push({ uri: prop.uri, label, range })
    }
  }

  // Create class nodes
  for (const cls of ontology.classes.values()) {
    elements.push({
      data: {
        id: cls.uri,
        label: cls.label || localName(cls.uri),
        type: 'class',
        comment: cls.comment,
        datatypeProperties: dtPropsByDomain.get(cls.uri) || []
      }
    })
  }

  // Create subClassOf edges
  for (const cls of ontology.classes.values()) {
    for (const parentUri of cls.subClassOf) {
      elements.push({
        data: {
          id: `subclass-${cls.uri}-${parentUri}`,
          source: cls.uri,
          target: parentUri,
          label: 'subClassOf',
          type: 'subClassOf'
        }
      })
    }

    for (const disjointUri of cls.disjointWith) {
      elements.push({
        data: {
          id: `disjoint-${cls.uri}-${disjointUri}`,
          source: cls.uri,
          target: disjointUri,
          label: 'disjointWith',
          type: 'disjointWith'
        }
      })
    }
  }

  // Create object property edges
  for (const prop of ontology.objectProperties.values()) {
    const label = prop.label || localName(prop.uri)
    for (const domainUri of prop.domain) {
      for (const rangeUri of prop.range) {
        elements.push({
          data: {
            id: `objprop-${prop.uri}-${domainUri}-${rangeUri}`,
            source: domainUri,
            target: rangeUri,
            label,
            type: 'objectProperty',
            uri: prop.uri
          }
        })
      }
    }
  }

  return elements
}
