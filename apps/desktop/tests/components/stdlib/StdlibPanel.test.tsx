import type { Schema } from '@contexture/core/ir';
import { StdlibPanel } from '@renderer/components/stdlib/StdlibPanel';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

const schema: Schema = {
  version: '1',
  types: [
    {
      kind: 'object',
      name: 'Artist',
      fields: [
        { name: 'website', type: { kind: 'ref', typeName: 'common.URL' } },
        { name: 'country', type: { kind: 'ref', typeName: 'place.CountryCode' } },
      ],
    },
  ],
};

describe('StdlibPanel', () => {
  afterEach(cleanup);

  it('lists stdlib types with examples and current schema usage', () => {
    render(<StdlibPanel schema={schema} />);

    expect(screen.getByRole('heading', { name: 'Stdlib' })).toBeInTheDocument();
    expect(screen.getByText('common.URL')).toBeInTheDocument();
    expect(screen.getByText('Artist.website')).toBeInTheDocument();
    expect(screen.getByText('place.CountryCode')).toBeInTheDocument();
    expect(screen.getByText('Artist.country')).toBeInTheDocument();
  });

  it('renders structured examples as formatted JSON', () => {
    render(<StdlibPanel schema={schema} />);

    const personName = screen.getByText('identity.PersonName').closest('article');
    expect(personName).not.toBeNull();
    expect(personName?.querySelector('pre')).toHaveTextContent('"given": "value"');
  });

  it('filters stdlib types by search text', () => {
    render(<StdlibPanel schema={schema} />);

    const search = screen.getByLabelText('Search stdlib');
    expect(search).toHaveAttribute('type', 'search');

    fireEvent.change(search, { target: { value: 'ISODate' } });

    expect(screen.getByText('common.ISODate')).toBeInTheDocument();
    expect(screen.queryByText('common.URL')).not.toBeInTheDocument();
  });

  it('clears the search with Escape and the clear button', () => {
    render(<StdlibPanel schema={schema} />);

    const search = screen.getByLabelText('Search stdlib');
    fireEvent.change(search, { target: { value: 'ISODate' } });

    fireEvent.keyDown(search, { key: 'Escape' });
    expect(search).toHaveValue('');
    expect(screen.getByText('common.URL')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'CountryCode' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear stdlib search' }));

    expect(search).toHaveValue('');
    expect(screen.getByText('common.URL')).toBeInTheDocument();
  });

  it('focuses the selected stdlib type from the canvas', () => {
    render(<StdlibPanel schema={schema} focusedTypeName="common.URL" />);

    expect(screen.getByLabelText('Search stdlib')).toHaveValue('common.URL');
    expect(screen.getByText('common.URL').closest('article')).toHaveClass('border-primary/70');
    expect(screen.queryByText('common.Email')).not.toBeInTheDocument();
  });
});
