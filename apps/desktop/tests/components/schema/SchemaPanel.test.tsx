/**
 * SchemaPanel — renders the emitted Zod source handed to it.
 *
 * Shiki is mocked (the real highlighter does async WASM-free init
 * we don't need here); the panel falls back to a plain <pre> when
 * the highlighter promise is still unresolved, which is the state
 * we assert against. That keeps these tests deterministic and off
 * the shiki code path — shiki is covered by its own vendor tests.
 */

import { SchemaPanel } from '@renderer/components/schema/SchemaPanel';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Keep shiki init pending forever so the panel renders the plain
// <pre> fallback. We still exercise the effect's code path.
vi.mock('@renderer/components/schema/shiki-highlighter', () => ({
  getHighlighter: () => new Promise(() => undefined),
  SHIKI_THEMES: { light: 'github-light', dark: 'github-dark' },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SchemaPanel', () => {
  it('renders the empty state when the schema has no types', () => {
    render(<SchemaPanel zodSource="" isEmpty={true} error={null} />);
    expect(screen.getByText(/no schema yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId('schema-copy')).not.toBeInTheDocument();
    expect(screen.queryByTestId('schema-code')).not.toBeInTheDocument();
  });

  it('renders the emitted source in a <pre> while shiki initialises', () => {
    const source = "// Generated\nimport { z } from 'zod';\nexport const Foo = z.object({});\n";
    render(<SchemaPanel zodSource={source} isEmpty={false} error={null} />);
    const code = screen.getByTestId('schema-code');
    expect(code).toBeInTheDocument();
    expect(code.textContent).toContain("import { z } from 'zod'");
    expect(code.textContent).toContain('export const Foo = z.object({})');
  });

  it('invokes onCopy with the full source when Copy is clicked', () => {
    const source = '// code\nexport const A = 1;\n';
    const onCopy = vi.fn();
    render(<SchemaPanel zodSource={source} isEmpty={false} error={null} onCopy={onCopy} />);
    fireEvent.click(screen.getByTestId('schema-copy'));
    expect(onCopy).toHaveBeenCalledWith(source);
  });

  it('renders an error message when `error` is non-null and hides the code/copy controls', () => {
    render(
      <SchemaPanel
        zodSource=""
        isEmpty={false}
        error="Unknown field kind: 'frobnicate'"
        onCopy={vi.fn()}
      />,
    );
    const err = screen.getByTestId('schema-error');
    expect(err).toBeInTheDocument();
    expect(err.textContent).toContain("Unknown field kind: 'frobnicate'");
    expect(screen.queryByTestId('schema-copy')).not.toBeInTheDocument();
    expect(screen.queryByTestId('schema-code')).not.toBeInTheDocument();
  });

  it('prefers the empty state over the error state when the schema is empty', () => {
    render(<SchemaPanel zodSource="" isEmpty={true} error="shouldnt render" onCopy={vi.fn()} />);
    expect(screen.getByText(/no schema yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId('schema-error')).not.toBeInTheDocument();
  });

  it('shows the supplied filename in the header and a default when none is given', () => {
    const source = 'export const A = 1;\n';
    const { rerender } = render(
      <SchemaPanel
        zodSource={source}
        isEmpty={false}
        error={null}
        schemaFileName="allotment.schema.ts"
      />,
    );
    expect(screen.getByTestId('schema-filename').textContent).toContain('allotment.schema.ts');

    rerender(<SchemaPanel zodSource={source} isEmpty={false} error={null} />);
    expect(screen.getByTestId('schema-filename').textContent).toContain('schema.ts');
  });

  it('steps the code font size up and down and disables at the bounds', () => {
    const source = 'export const A = 1;\n';
    render(<SchemaPanel zodSource={source} isEmpty={false} error={null} />);
    const code = screen.getByTestId('schema-code') as HTMLElement;
    const decrease = screen.getByTestId('schema-font-decrease');
    const increase = screen.getByTestId('schema-font-increase');

    // Default is the middle of the ladder — both buttons enabled, 13px applied inline.
    expect(code.style.fontSize).toBe('13px');
    expect(decrease).not.toBeDisabled();
    expect(increase).not.toBeDisabled();

    // Shrink to the floor (11px) — two clicks from 13 → 12 → 11.
    fireEvent.click(decrease);
    fireEvent.click(decrease);
    expect(code.style.fontSize).toBe('11px');
    expect(decrease).toBeDisabled();

    // Grow to the ceiling (20px) — ladder is [11,12,13,14,16,18,20].
    for (let i = 0; i < 6; i++) fireEvent.click(increase);
    expect(code.style.fontSize).toBe('20px');
    expect(increase).toBeDisabled();
  });
});
