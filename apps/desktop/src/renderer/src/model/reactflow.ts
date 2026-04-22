import type { Edge, Node } from '@xyflow/react';
import type { ValidationError } from '../services/validation';
import type { Ontology, OWLCharacteristic, Restriction } from './types';

export interface ClassNodeData extends Record<string, unknown> {
  label: string;
  uri: string;
  comment?: string;
  datatypeProperties: { uri: string; label: string; range: string }[];
  restrictions: Restriction[];
  errorCount: number;
  warningCount: number;
}

export interface IndividualNodeData extends Record<string, unknown> {
  label: string;
  uri: string;
  comment?: string;
  types: string[];
  typeLabels: string[];
  errorCount: number;
  warningCount: number;
}

export interface GroupNodeData extends Record<string, unknown> {
  label: string;
}

export type ClassNode = Node<ClassNodeData, 'class'>;
export type IndividualNode = Node<IndividualNodeData, 'individual'>;
export type GroupNode = Node<GroupNodeData, 'group'>;
export type ContextureNode = ClassNode | IndividualNode | GroupNode;

export interface ObjPropEdgeData extends Record<string, unknown> {
  label: string;
  uri: string;
  characteristics?: OWLCharacteristic[];
}

export interface SubClassEdgeData extends Record<string, unknown> {
  label: string;
}

export interface DisjointEdgeData extends Record<string, unknown> {
  label: string;
}

export interface RestrictionEdgeData extends Record<string, unknown> {
  label: string;
  qualifier: string;
}

function localName(uri: string): string {
  const hash = uri.lastIndexOf('#');
  const slash = uri.lastIndexOf('/');
  const idx = Math.max(hash, slash);
  return idx >= 0 ? uri.substring(idx + 1) : uri;
}

export interface ReactFlowElements {
  nodes: (ClassNode | IndividualNode)[];
  edges: Edge[];
}

export function ontologyToReactFlowElements(
  ontology: Ontology,
  validationErrors?: ValidationError[],
): ReactFlowElements {
  // Build per-URI error/warning counts
  const errorCounts = new Map<string, number>();
  const warningCounts = new Map<string, number>();
  if (validationErrors) {
    for (const err of validationErrors) {
      if (err.severity === 'error') {
        errorCounts.set(err.elementUri, (errorCounts.get(err.elementUri) ?? 0) + 1);
      } else {
        warningCounts.set(err.elementUri, (warningCounts.get(err.elementUri) ?? 0) + 1);
      }
    }
  }
  const nodes: (ClassNode | IndividualNode)[] = [];
  const edges: Edge[] = [];

  // Build map of datatype properties by domain class
  const dtPropsByDomain = new Map<string, { uri: string; label: string; range: string }[]>();
  for (const prop of ontology.datatypeProperties.values()) {
    const label = prop.label || localName(prop.uri);
    const range = localName(prop.range);
    for (const domainUri of prop.domain) {
      if (!dtPropsByDomain.has(domainUri)) dtPropsByDomain.set(domainUri, []);
      dtPropsByDomain.get(domainUri)?.push({ uri: prop.uri, label, range });
    }
  }

  // Class nodes — positions start at {0, 0}, layout engine will place them
  let idx = 0;
  for (const cls of ontology.classes.values()) {
    const total = ontology.classes.size;
    const cols = Math.ceil(Math.sqrt(total));
    const row = Math.floor(idx / cols);
    const col = idx % cols;
    nodes.push({
      id: cls.uri,
      type: 'class',
      position: { x: col * 260, y: row * 160 },
      data: {
        label: cls.label || localName(cls.uri),
        uri: cls.uri,
        comment: cls.comment,
        datatypeProperties: dtPropsByDomain.get(cls.uri) || [],
        restrictions: cls.restrictions || [],
        errorCount: errorCounts.get(cls.uri) ?? 0,
        warningCount: warningCounts.get(cls.uri) ?? 0,
      },
    });
    idx++;
  }

  // SubClassOf edges
  for (const cls of ontology.classes.values()) {
    for (const parentUri of cls.subClassOf) {
      edges.push({
        id: `subclass-${cls.uri}-${parentUri}`,
        source: cls.uri,
        target: parentUri,
        type: 'subClassOf',
        data: { label: 'subClassOf' },
      });
    }

    for (const disjointUri of cls.disjointWith) {
      edges.push({
        id: `disjoint-${cls.uri}-${disjointUri}`,
        source: cls.uri,
        target: disjointUri,
        type: 'disjointWith',
        data: { label: 'disjointWith' },
      });
    }
  }

  // Build set of (source, target, property) tuples covered by object property edges
  // so restriction edges can skip duplicates
  const objPropEdgePairs = new Set<string>();
  for (const prop of ontology.objectProperties.values()) {
    const label = prop.label || localName(prop.uri);
    for (const domainUri of prop.domain) {
      for (const rangeUri of prop.range) {
        objPropEdgePairs.add(`${domainUri}|${rangeUri}|${prop.uri}`);
        edges.push({
          id: `objprop-${prop.uri}-${domainUri}-${rangeUri}`,
          source: domainUri,
          target: rangeUri,
          type: 'objectProperty',
          data: { label, uri: prop.uri, characteristics: prop.characteristics },
        });
      }
    }
  }

  // Restriction edges for someValuesFrom / allValuesFrom targeting other classes
  // Skip when an object property edge already covers the same source→target→property
  for (const cls of ontology.classes.values()) {
    if (!cls.restrictions) continue;
    for (const r of cls.restrictions) {
      if (r.type !== 'someValuesFrom' && r.type !== 'allValuesFrom') continue;
      if (!ontology.classes.has(r.value)) continue;
      if (objPropEdgePairs.has(`${cls.uri}|${r.value}|${r.onProperty}`)) continue;
      const qualifier = r.type === 'someValuesFrom' ? 'some' : 'only';
      edges.push({
        id: `restriction-${cls.uri}-${r.onProperty}-${r.type}-${r.value}`,
        source: cls.uri,
        target: r.value,
        type: 'restriction',
        data: { label: `${localName(r.onProperty)} [${qualifier}]`, qualifier },
      });
    }
  }

  // Individual nodes
  const totalAll = ontology.classes.size + ontology.individuals.size;
  const cols = Math.ceil(Math.sqrt(totalAll));
  for (const ind of ontology.individuals.values()) {
    const row = Math.floor(idx / cols);
    const col = idx % cols;
    nodes.push({
      id: ind.uri,
      type: 'individual',
      position: { x: col * 260, y: row * 160 },
      data: {
        label: ind.label || localName(ind.uri),
        uri: ind.uri,
        comment: ind.comment,
        types: ind.types,
        typeLabels: ind.types.map((t) => ontology.classes.get(t)?.label || localName(t)),
        errorCount: errorCounts.get(ind.uri) ?? 0,
        warningCount: warningCounts.get(ind.uri) ?? 0,
      },
    } as IndividualNode);
    idx++;

    // rdf:type edges from individual to its classes
    for (const typeUri of ind.types) {
      edges.push({
        id: `typeof-${ind.uri}-${typeUri}`,
        source: ind.uri,
        target: typeUri,
        type: 'typeOf',
        data: { label: 'rdf:type' },
      });
    }
  }

  return { nodes, edges };
}
