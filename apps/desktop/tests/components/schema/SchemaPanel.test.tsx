/**
 * SchemaPanel — renders the emitted schema source handed to it.
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

const DEFAULT_PROPS = {
  zodSource: '',
  jsonSource: '',
  convexSource: '',
  isEmpty: false,
  error: null,
} as const;

describe('SchemaPanel', () => {
  it('renders the empty state when the schema has no types', () => {
    render(<SchemaPanel {...DEFAULT_PROPS} isEmpty={true} />);
    expect(screen.getByText(/no schema yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId('schema-copy')).not.toBeInTheDocument();
    expect(screen.queryByTestId('schema-code')).not.toBeInTheDocument();
  });

  it('renders the emitted source in a <pre> while shiki initialises', () => {
    const source = "// Generated\nimport { z } from 'zod';\nexport const Foo = z.object({});\n";
    render(<SchemaPanel {...DEFAULT_PROPS} zodSource={source} />);
    const code = screen.getByTestId('schema-code');
    expect(code).toBeInTheDocument();
    expect(code.textContent).toContain("import { z } from 'zod'");
    expect(code.textContent).toContain('export const Foo = z.object({})');
  });

  it('invokes onCopy with the zod source when Copy is clicked on the Zod tab', () => {
    const source = '// code\nexport const A = 1;\n';
    const onCopy = vi.fn();
    render(<SchemaPanel {...DEFAULT_PROPS} zodSource={source} onCopy={onCopy} />);
    fireEvent.click(screen.getByTestId('schema-copy'));
    expect(onCopy).toHaveBeenCalledWith(source);
  });

  it('renders an error message when `error` is non-null and hides the code/copy controls', () => {
    render(
      <SchemaPanel {...DEFAULT_PROPS} error="Unknown field kind: 'frobnicate'" onCopy={vi.fn()} />,
    );
    const err = screen.getByTestId('schema-error');
    expect(err).toBeInTheDocument();
    expect(err.textContent).toContain("Unknown field kind: 'frobnicate'");
    expect(screen.queryByTestId('schema-copy')).not.toBeInTheDocument();
    expect(screen.queryByTestId('schema-code')).not.toBeInTheDocument();
  });

  it('prefers the empty state over the error state when the schema is empty', () => {
    render(
      <SchemaPanel {...DEFAULT_PROPS} isEmpty={true} error="shouldnt render" onCopy={vi.fn()} />,
    );
    expect(screen.getByText(/no schema yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId('schema-error')).not.toBeInTheDocument();
  });

  it('shows the supplied filename in the header and a default when none is given', () => {
    const source = 'export const A = 1;\n';
    const { rerender } = render(
      <SchemaPanel {...DEFAULT_PROPS} zodSource={source} schemaFileName="allotment.schema.ts" />,
    );
    expect(screen.getByTestId('schema-filename').textContent).toContain('allotment.schema.ts');

    rerender(<SchemaPanel {...DEFAULT_PROPS} zodSource={source} />);
    expect(screen.getByTestId('schema-filename').textContent).toContain('schema.ts');
  });

  it('steps the code font size up and down and disables at the bounds', () => {
    const source = 'export const A = 1;\n';
    render(<SchemaPanel {...DEFAULT_PROPS} zodSource={source} />);
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

  describe('multi-schema tabs', () => {
    it('shows Zod tab active by default', () => {
      const zodSrc = "import { z } from 'zod';\n";
      render(<SchemaPanel {...DEFAULT_PROPS} zodSource={zodSrc} />);
      const zodTab = screen.getByTestId('schema-tab-zod');
      expect(zodTab).toHaveAttribute('aria-selected', 'true');
    });

    it('switches to JSON Schema source when the JSON tab is clicked', () => {
      const zodSrc = "import { z } from 'zod';\n";
      const jsonSrc = '{\n  "$schema": "https://json-schema.org/draft/2020-12/schema"\n}';
      render(<SchemaPanel {...DEFAULT_PROPS} zodSource={zodSrc} jsonSource={jsonSrc} />);

      fireEvent.click(screen.getByTestId('schema-tab-json'));
      expect(screen.getByTestId('schema-code').textContent).toContain('$schema');
    });

    it('switches to Convex source when the Convex tab is clicked', () => {
      const convexSrc = 'import { defineSchema } from "convex/server";\n';
      render(<SchemaPanel {...DEFAULT_PROPS} zodSource="zod" convexSource={convexSrc} />);

      fireEvent.click(screen.getByTestId('schema-tab-convex'));
      expect(screen.getByTestId('schema-code').textContent).toContain('defineSchema');
    });

    it('copies the active tab source when Copy is clicked', () => {
      const jsonSrc = '{ "$schema": "..." }';
      const onCopy = vi.fn();
      render(
        <SchemaPanel {...DEFAULT_PROPS} zodSource="zod" jsonSource={jsonSrc} onCopy={onCopy} />,
      );

      fireEvent.click(screen.getByTestId('schema-tab-json'));
      fireEvent.click(screen.getByTestId('schema-copy'));
      expect(onCopy).toHaveBeenCalledWith(jsonSrc);
    });

    it('shows the JSON Schema filename when on the JSON tab', () => {
      render(
        <SchemaPanel
          {...DEFAULT_PROPS}
          zodSource="a"
          jsonSource="b"
          schemaFileName="allotment.schema.ts"
        />,
      );
      fireEvent.click(screen.getByTestId('schema-tab-json'));
      expect(screen.getByTestId('schema-filename').textContent).toContain('allotment.schema.json');
    });

    it('shows the Convex filename when on the Convex tab', () => {
      render(
        <SchemaPanel
          {...DEFAULT_PROPS}
          zodSource="a"
          convexSource="b"
          schemaFileName="allotment.schema.ts"
        />,
      );
      fireEvent.click(screen.getByTestId('schema-tab-convex'));
      expect(screen.getByTestId('schema-filename').textContent).toContain('convex/schema.ts');
    });

    it('derives JSON filename via .ts → .json fallback when name has no .schema.ts suffix', () => {
      render(<SchemaPanel {...DEFAULT_PROPS} zodSource="a" jsonSource="b" />);
      // Default schemaFileName is 'schema.ts' — no '.schema.ts' segment, so the
      // fallback .ts → .json replacement must fire.
      fireEvent.click(screen.getByTestId('schema-tab-json'));
      expect(screen.getByTestId('schema-filename').textContent).toContain('schema.json');
    });
  });
});
