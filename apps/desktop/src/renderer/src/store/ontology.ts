import { create } from 'zustand';
import { track } from '../lib/analytics';
import { getAdapterForFilePath } from '../model/formats';
import { type ParseWarning, parseTurtleWithWarnings } from '../model/parse';
import { serializeToTurtle } from '../model/serialize';
import type {
  DatatypeProperty,
  Individual,
  ObjectProperty,
  Ontology,
  OntologyClass,
} from '../model/types';
import { createEmptyOntology } from '../model/types';

interface OntologyState {
  ontology: Ontology;
  filePath: string | null;
  isDirty: boolean;
  importWarnings: ParseWarning[];

  // Actions
  loadFromFile: (content: string, filePath: string) => void;
  loadFromTurtle: (turtle: string, filePath?: string) => void;
  clearImportWarnings: () => void;
  exportToTurtle: () => string;
  reset: () => void;
  setFilePath: (path: string | null) => void;
  markClean: () => void;

  // Class operations
  addClass: (uri: string, cls?: Partial<OntologyClass>) => void;
  updateClass: (uri: string, changes: Partial<OntologyClass>) => void;
  removeClass: (uri: string) => void;

  // Object property operations
  addObjectProperty: (uri: string, prop?: Partial<ObjectProperty>) => void;
  updateObjectProperty: (uri: string, changes: Partial<ObjectProperty>) => void;
  removeObjectProperty: (uri: string) => void;

  // Datatype property operations
  addDatatypeProperty: (uri: string, prop?: Partial<DatatypeProperty>) => void;
  updateDatatypeProperty: (uri: string, changes: Partial<DatatypeProperty>) => void;
  removeDatatypeProperty: (uri: string) => void;

  // Individual operations
  addIndividual: (uri: string, ind?: Partial<Individual>) => void;
  updateIndividual: (uri: string, changes: Partial<Individual>) => void;
  removeIndividual: (uri: string) => void;

  // Undo/redo support
  restoreOntology: (ontology: Ontology) => void;
}

export const useOntologyStore = create<OntologyState>((set, get) => ({
  ontology: createEmptyOntology(),
  filePath: null,
  isDirty: false,
  importWarnings: [],

  loadFromFile: (content, filePath) => {
    const adapter = getAdapterForFilePath(filePath);
    const { ontology, warnings } = adapter
      ? adapter.parse(content)
      : parseTurtleWithWarnings(content);
    set({ ontology, filePath, isDirty: false, importWarnings: warnings });
    track('ontology_loaded', {
      classCount: ontology.classes.size,
      individualCount: ontology.individuals.size,
      source: 'file',
      format: filePath.substring(filePath.lastIndexOf('.')).toLowerCase(),
    });
  },

  loadFromTurtle: (turtle, filePath) => {
    const { ontology, warnings } = parseTurtleWithWarnings(turtle);
    set({ ontology, filePath: filePath ?? null, isDirty: false, importWarnings: warnings });
    track('ontology_loaded', {
      classCount: ontology.classes.size,
      individualCount: ontology.individuals.size,
      source: filePath?.startsWith('Sample') ? 'sample' : 'file',
    });
  },

  clearImportWarnings: () => set({ importWarnings: [] }),

  exportToTurtle: () => {
    track('ontology_exported', { classCount: get().ontology.classes.size });
    return serializeToTurtle(get().ontology);
  },

  reset: () => {
    set({ ontology: createEmptyOntology(), filePath: null, isDirty: false });
  },

  setFilePath: (path) => set({ filePath: path }),
  markClean: () => set({ isDirty: false }),

  addClass: (uri, partial) => {
    set((state) => {
      const ontology = cloneOntology(state.ontology);

      const isFirst = ontology.classes.size === 0;
      ontology.classes.set(uri, {
        uri,
        subClassOf: [],
        disjointWith: [],
        ...partial,
      });
      if (isFirst) track('first_ontology_created');
      track('class_added');
      return { ontology, isDirty: true };
    });
  },

  updateClass: (uri, changes) => {
    set((state) => {
      const existing = state.ontology.classes.get(uri);
      if (!existing) return state;

      const ontology = cloneOntology(state.ontology);
      ontology.classes.set(uri, { ...existing, ...changes });
      return { ontology, isDirty: true };
    });
  },

  removeClass: (uri) => {
    set((state) => {
      const ontology = cloneOntology(state.ontology);
      ontology.classes.delete(uri);

      // Remove references from other classes
      for (const cls of ontology.classes.values()) {
        cls.subClassOf = cls.subClassOf.filter((u) => u !== uri);
        cls.disjointWith = cls.disjointWith.filter((u) => u !== uri);
      }
      // Remove properties that reference this class
      for (const [propUri, prop] of ontology.objectProperties) {
        prop.domain = prop.domain.filter((u) => u !== uri);
        prop.range = prop.range.filter((u) => u !== uri);
        if (prop.domain.length === 0 && prop.range.length === 0) {
          ontology.objectProperties.delete(propUri);
        }
      }
      for (const [propUri, prop] of ontology.datatypeProperties) {
        prop.domain = prop.domain.filter((u) => u !== uri);
        if (prop.domain.length === 0) {
          ontology.datatypeProperties.delete(propUri);
        }
      }

      return { ontology, isDirty: true };
    });
  },

  addObjectProperty: (uri, partial) => {
    set((state) => {
      const ontology = cloneOntology(state.ontology);
      ontology.objectProperties.set(uri, {
        uri,
        domain: [],
        range: [],
        ...partial,
      });
      track('object_property_added');
      return { ontology, isDirty: true };
    });
  },

  updateObjectProperty: (uri, changes) => {
    set((state) => {
      const existing = state.ontology.objectProperties.get(uri);
      if (!existing) return state;

      const ontology = cloneOntology(state.ontology);
      ontology.objectProperties.set(uri, { ...existing, ...changes });
      return { ontology, isDirty: true };
    });
  },

  removeObjectProperty: (uri) => {
    set((state) => {
      const ontology = cloneOntology(state.ontology);
      ontology.objectProperties.delete(uri);
      return { ontology, isDirty: true };
    });
  },

  addDatatypeProperty: (uri, partial) => {
    set((state) => {
      const ontology = cloneOntology(state.ontology);
      ontology.datatypeProperties.set(uri, {
        uri,
        domain: [],
        range: 'http://www.w3.org/2001/XMLSchema#string',
        ...partial,
      });
      track('datatype_property_added');
      return { ontology, isDirty: true };
    });
  },

  updateDatatypeProperty: (uri, changes) => {
    set((state) => {
      const existing = state.ontology.datatypeProperties.get(uri);
      if (!existing) return state;

      const ontology = cloneOntology(state.ontology);
      ontology.datatypeProperties.set(uri, { ...existing, ...changes });
      return { ontology, isDirty: true };
    });
  },

  removeDatatypeProperty: (uri) => {
    set((state) => {
      const ontology = cloneOntology(state.ontology);
      ontology.datatypeProperties.delete(uri);
      return { ontology, isDirty: true };
    });
  },

  addIndividual: (uri, partial) => {
    set((state) => {
      const ontology = cloneOntology(state.ontology);
      ontology.individuals.set(uri, {
        uri,
        types: [],
        objectPropertyAssertions: [],
        dataPropertyAssertions: [],
        ...partial,
      });
      track('individual_added');
      return { ontology, isDirty: true };
    });
  },

  updateIndividual: (uri, changes) => {
    set((state) => {
      const existing = state.ontology.individuals.get(uri);
      if (!existing) return state;

      const ontology = cloneOntology(state.ontology);
      ontology.individuals.set(uri, { ...existing, ...changes });
      return { ontology, isDirty: true };
    });
  },

  removeIndividual: (uri) => {
    set((state) => {
      const ontology = cloneOntology(state.ontology);
      ontology.individuals.delete(uri);
      return { ontology, isDirty: true };
    });
  },

  restoreOntology: (ontology) => set({ ontology: cloneOntology(ontology), isDirty: true }),
}));

function cloneOntology(ontology: Ontology): Ontology {
  return {
    prefixes: new Map(ontology.prefixes),
    classes: new Map(
      Array.from(ontology.classes.entries()).map(([k, v]) => [
        k,
        { ...v, subClassOf: [...v.subClassOf], disjointWith: [...v.disjointWith] },
      ]),
    ),
    objectProperties: new Map(
      Array.from(ontology.objectProperties.entries()).map(([k, v]) => [
        k,
        { ...v, domain: [...v.domain], range: [...v.range] },
      ]),
    ),
    datatypeProperties: new Map(
      Array.from(ontology.datatypeProperties.entries()).map(([k, v]) => [
        k,
        { ...v, domain: [...v.domain] },
      ]),
    ),
    individuals: new Map(
      Array.from(ontology.individuals.entries()).map(([k, v]) => [
        k,
        {
          ...v,
          types: [...v.types],
          objectPropertyAssertions: v.objectPropertyAssertions.map((a) => ({ ...a })),
          dataPropertyAssertions: v.dataPropertyAssertions.map((a) => ({ ...a })),
        },
      ]),
    ),
    annotationProperties: new Map(
      Array.from(ontology.annotationProperties.entries()).map(([k, v]) => [
        k,
        { ...v, subPropertyOf: [...v.subPropertyOf] },
      ]),
    ),
    ontologyMetadata: ontology.ontologyMetadata
      ? {
          ...ontology.ontologyMetadata,
          imports: [...ontology.ontologyMetadata.imports],
          annotations: ontology.ontologyMetadata.annotations.map((a) => ({ ...a })),
        }
      : undefined,
  };
}
