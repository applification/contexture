import { useOntologyStore } from '@renderer/store/ontology';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const { EdgeDetail } = await import('@renderer/components/detail/EdgeDetail');

const BASE_PROP = {
  uri: 'http://ex/rel',
  domain: [],
  range: [],
  characteristics: [] as import('@renderer/model/types').OWLCharacteristic[],
};

function resetStore() {
  useOntologyStore.getState().reset();
}

describe('EdgeDetail — Characteristics section', () => {
  beforeEach(resetStore);
  afterEach(cleanup);

  describe('no characteristics', () => {
    it('does not render Characteristics section when array is empty', () => {
      render(<EdgeDetail property={{ ...BASE_PROP, characteristics: [] }} type="objectProperty" />);
      expect(screen.queryByText('Characteristics')).not.toBeInTheDocument();
    });
  });

  describe('single characteristic', () => {
    it('renders Characteristics section heading when characteristics present', () => {
      render(
        <EdgeDetail
          property={{ ...BASE_PROP, characteristics: ['transitive'] }}
          type="objectProperty"
        />,
      );
      expect(screen.getByText('Characteristics')).toBeInTheDocument();
    });

    it('shows Transitive badge', () => {
      render(
        <EdgeDetail
          property={{ ...BASE_PROP, characteristics: ['transitive'] }}
          type="objectProperty"
        />,
      );
      expect(screen.getByText('Transitive')).toBeInTheDocument();
    });

    it('shows Symmetric badge', () => {
      render(
        <EdgeDetail
          property={{ ...BASE_PROP, characteristics: ['symmetric'] }}
          type="objectProperty"
        />,
      );
      expect(screen.getByText('Symmetric')).toBeInTheDocument();
    });

    it('shows Reflexive badge', () => {
      render(
        <EdgeDetail
          property={{ ...BASE_PROP, characteristics: ['reflexive'] }}
          type="objectProperty"
        />,
      );
      expect(screen.getByText('Reflexive')).toBeInTheDocument();
    });

    it('shows Functional badge', () => {
      render(
        <EdgeDetail
          property={{ ...BASE_PROP, characteristics: ['functional'] }}
          type="objectProperty"
        />,
      );
      expect(screen.getByText('Functional')).toBeInTheDocument();
    });

    it('shows Inv. Functional badge', () => {
      render(
        <EdgeDetail
          property={{ ...BASE_PROP, characteristics: ['inverseFunctional'] }}
          type="objectProperty"
        />,
      );
      expect(screen.getByText('Inv. Functional')).toBeInTheDocument();
    });
  });

  describe('multiple characteristics', () => {
    it('renders all provided characteristic badges', () => {
      render(
        <EdgeDetail
          property={{
            ...BASE_PROP,
            characteristics: [
              'transitive',
              'symmetric',
              'reflexive',
              'functional',
              'inverseFunctional',
            ],
          }}
          type="objectProperty"
        />,
      );
      expect(screen.getByText('Transitive')).toBeInTheDocument();
      expect(screen.getByText('Symmetric')).toBeInTheDocument();
      expect(screen.getByText('Reflexive')).toBeInTheDocument();
      expect(screen.getByText('Functional')).toBeInTheDocument();
      expect(screen.getByText('Inv. Functional')).toBeInTheDocument();
    });

    it('renders two characteristics without duplicates', () => {
      render(
        <EdgeDetail
          property={{ ...BASE_PROP, characteristics: ['transitive', 'functional'] }}
          type="objectProperty"
        />,
      );
      expect(screen.getAllByText('Transitive')).toHaveLength(1);
      expect(screen.getAllByText('Functional')).toHaveLength(1);
    });
  });

  describe('section ordering', () => {
    it('Characteristics section appears before Domain section', () => {
      render(
        <EdgeDetail
          property={{
            ...BASE_PROP,
            characteristics: ['transitive'],
            domain: ['http://ex/Person'],
            range: [],
          }}
          type="objectProperty"
        />,
      );
      const charHeading = screen.getByText('Characteristics');
      const domainHeading = screen.getByText('Domain');
      // compareDocumentPosition: 4 = DOCUMENT_POSITION_FOLLOWING (domain comes after characteristics)
      expect(
        charHeading.compareDocumentPosition(domainHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
  });
});
