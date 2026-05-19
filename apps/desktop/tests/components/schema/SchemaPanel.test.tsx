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
import userEvent from '@testing-library/user-event';
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

  it('shows Agent setup with the packaged Codex MCP install command', () => {
    render(<SchemaPanel {...DEFAULT_PROPS} zodSource="zod" />);

    expect(screen.getByTestId('agent-setup')).toHaveTextContent('Agent setup');
    fireEvent.click(screen.getByTestId('agent-setup'));
    expect(screen.getByTestId('agent-setup-install-value')).toHaveTextContent(
      'codex mcp add contexture -- /Applications/Contexture.app/Contents/MacOS/Contexture --mcp',
    );
    expect(screen.getByTestId('agent-setup-content')).toHaveTextContent('inspect_contexture');
    expect(screen.getByTestId('agent-setup-content')).toHaveTextContent('validate_contexture');
    expect(screen.getByTestId('agent-setup-content')).toHaveTextContent('apply_contexture_op');
    expect(screen.getByTestId('agent-setup-content')).toHaveTextContent('emit_contexture');
    expect(screen.getByTestId('agent-setup-content')).toHaveTextContent('check_contexture_drift');
  });

  it('copies the Agent setup install command with announced feedback', () => {
    const onCopy = vi.fn();
    render(<SchemaPanel {...DEFAULT_PROPS} zodSource="zod" onCopy={onCopy} />);

    fireEvent.click(screen.getByTestId('agent-setup'));
    fireEvent.click(screen.getByTestId('agent-setup-install-copy'));
    expect(onCopy).toHaveBeenCalledWith(
      'codex mcp add contexture -- /Applications/Contexture.app/Contents/MacOS/Contexture --mcp',
    );
    expect(screen.getByText('Copied install command')).toBeInTheDocument();
  });

  it('uses the saved document path in the Agent setup prompt and smoke test', () => {
    const onCopy = vi.fn();
    render(
      <SchemaPanel
        {...DEFAULT_PROPS}
        zodSource="zod"
        documentFilePath="/repo/garden.contexture.json"
        onCopy={onCopy}
      />,
    );

    fireEvent.click(screen.getByTestId('agent-setup'));
    expect(screen.getByTestId('agent-setup-prompt-value')).toHaveTextContent(
      'Use the Contexture MCP server to inspect /repo/garden.contexture.json, then validate, emit, and check drift before finishing.',
    );
    expect(screen.getByTestId('agent-setup-smoke-value')).toHaveTextContent(
      'Ask Codex: "List the contexture MCP tools, then inspect /repo/garden.contexture.json."',
    );

    fireEvent.click(screen.getByTestId('agent-setup-prompt-copy'));
    expect(onCopy).toHaveBeenCalledWith(
      'Use the Contexture MCP server to inspect /repo/garden.contexture.json, then validate, emit, and check drift before finishing.',
    );
  });

  it('shows a save-first Agent setup state before the document has a path', () => {
    const onRequestSave = vi.fn();
    render(
      <SchemaPanel
        {...DEFAULT_PROPS}
        zodSource="zod"
        documentFilePath={null}
        onRequestSave={onRequestSave}
      />,
    );

    fireEvent.click(screen.getByTestId('agent-setup'));
    expect(screen.getByTestId('agent-setup-unsaved')).toHaveTextContent(
      'Save this document to create a stable .contexture.json path before handing it to an agent.',
    );
    expect(screen.queryByLabelText('Saved-document prompt')).not.toBeInTheDocument();
    expect(screen.getByTestId('agent-setup-smoke-value')).toHaveTextContent(
      'Ask Codex: "List the contexture MCP tools."',
    );

    fireEvent.click(screen.getByText('Save first'));
    expect(onRequestSave).toHaveBeenCalledTimes(1);
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

  it('keeps Agent setup visible when generated preview emission fails', () => {
    render(
      <SchemaPanel
        {...DEFAULT_PROPS}
        error="Unknown field kind: 'frobnicate'"
        documentFilePath="/repo/garden.contexture.json"
        onCopy={vi.fn()}
      />,
    );

    expect(screen.getByTestId('schema-error')).toBeInTheDocument();
    expect(screen.getByTestId('agent-setup')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('agent-setup'));
    expect(screen.getByTestId('agent-setup-prompt-value')).toHaveTextContent(
      'Use the Contexture MCP server to inspect /repo/garden.contexture.json, then validate, emit, and check drift before finishing.',
    );
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

  describe('output selector', () => {
    async function chooseOutput(testId: string): Promise<void> {
      const user = userEvent.setup();
      await user.click(screen.getByTestId('schema-output-selector'));
      await user.click(await screen.findByTestId(testId));
    }

    it('shows Zod active by default without rendering a tab strip', () => {
      const zodSrc = "import { z } from 'zod';\n";
      render(<SchemaPanel {...DEFAULT_PROPS} zodSource={zodSrc} />);
      expect(screen.getByTestId('schema-output-selector')).toBeInTheDocument();
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
      expect(screen.getByTestId('schema-output-selector')).toHaveTextContent('Zod schema');
      expect(screen.queryByTestId('schema-group-ai')).not.toBeInTheDocument();
      expect(screen.queryByTestId('schema-group-forms')).not.toBeInTheDocument();
    });

    it('switches to JSON Schema source when the JSON output is selected', async () => {
      const zodSrc = "import { z } from 'zod';\n";
      const jsonSrc = '{\n  "$schema": "https://json-schema.org/draft/2020-12/schema"\n}';
      render(<SchemaPanel {...DEFAULT_PROPS} zodSource={zodSrc} jsonSource={jsonSrc} />);

      await chooseOutput('schema-output-json-schema');
      expect(screen.getByTestId('schema-code').textContent).toContain('$schema');
    });

    it('switches to Convex source when the Convex output is selected', async () => {
      const convexSrc = 'import { defineSchema } from "convex/server";\n';
      render(<SchemaPanel {...DEFAULT_PROPS} zodSource="zod" convexSource={convexSrc} />);

      await chooseOutput('schema-output-convex');
      expect(screen.getByTestId('schema-code').textContent).toContain('defineSchema');
    });

    it('shows non-empty AI and Forms outputs grouped away from Core in the selector', async () => {
      const user = userEvent.setup();
      render(
        <SchemaPanel
          {...DEFAULT_PROPS}
          zodSource="zod"
          additionalSources={[
            { type: 'ai-tool-schemas', source: '{\n  "tools": []\n}\n' },
            { type: 'structured-output-schemas', source: '' },
            { type: 'form-validators', source: 'export function validate() {}\n' },
          ]}
        />,
      );

      await user.click(screen.getByTestId('schema-output-selector'));
      expect(screen.getByTestId('schema-group-core')).toHaveTextContent('Zod schema');
      expect(screen.getByTestId('schema-group-ai')).toHaveTextContent('Tool schemas');
      expect(screen.getByTestId('schema-group-forms')).toHaveTextContent('Form validators');
      expect(
        screen.queryByTestId('schema-output-structured-output-schemas'),
      ).not.toBeInTheDocument();
    });

    it('shows disabled optional outputs as explicit configuration actions', () => {
      const onEnableOutput = vi.fn();
      render(
        <SchemaPanel
          {...DEFAULT_PROPS}
          zodSource="zod"
          additionalSources={[
            { type: 'ai-tool-schemas', enabled: false, source: '' },
            { type: 'form-validators', enabled: false, source: '' },
          ]}
          onEnableOutput={onEnableOutput}
        />,
      );

      fireEvent.click(screen.getByTestId('schema-output-config'));
      expect(screen.getByTestId('schema-group-ai')).toHaveTextContent('Tool schemas');
      expect(screen.getByTestId('schema-group-forms')).toHaveTextContent('Form validators');
      fireEvent.click(screen.getByTestId('schema-output-ai-tool-schemas'));
      expect(onEnableOutput).toHaveBeenCalledWith('ai-tool-schemas');
    });

    it('describes disabled optional outputs in the configuration popover', () => {
      render(
        <SchemaPanel
          {...DEFAULT_PROPS}
          zodSource="zod"
          additionalSources={[
            { type: 'ai-tool-schemas', enabled: false, source: '' },
            { type: 'form-validators', enabled: false, source: '' },
          ]}
        />,
      );

      fireEvent.click(screen.getByTestId('schema-output-config'));
      expect(screen.getByTestId('schema-output-ai-tool-schemas')).toHaveTextContent(
        /JSON Schema tool definitions/i,
      );
      expect(screen.getByTestId('schema-output-form-validators')).toHaveTextContent(
        /Type-safe validation helpers backed by generated Zod schemas/i,
      );
    });

    it('switches to an enabled AI source and shows its friendly filename', async () => {
      render(
        <SchemaPanel
          {...DEFAULT_PROPS}
          zodSource="zod"
          additionalSources={[{ type: 'mcp-definitions', source: '{\n  "servers": []\n}\n' }]}
        />,
      );

      await chooseOutput('schema-output-mcp-definitions');
      expect(screen.getByTestId('schema-code').textContent).toContain('"servers"');
      expect(screen.getByTestId('schema-filename').textContent).toContain(
        '.contexture/mcp-definitions.json',
      );
    });

    it('copies the active output source when Copy is clicked', async () => {
      const jsonSrc = '{ "$schema": "..." }';
      const onCopy = vi.fn();
      render(
        <SchemaPanel {...DEFAULT_PROPS} zodSource="zod" jsonSource={jsonSrc} onCopy={onCopy} />,
      );

      await chooseOutput('schema-output-json-schema');
      fireEvent.click(screen.getByTestId('schema-copy'));
      expect(onCopy).toHaveBeenCalledWith(jsonSrc);
    });

    it('opens the active generated file in the external editor', async () => {
      const user = userEvent.setup();
      const onOpenGeneratedFile = vi.fn();
      render(
        <SchemaPanel
          {...DEFAULT_PROPS}
          zodSource="zod"
          jsonSource="json"
          additionalSources={[{ type: 'mcp-definitions', source: '{\n  "servers": []\n}\n' }]}
          documentFilePath="/repo/garden.contexture.json"
          onOpenGeneratedFile={onOpenGeneratedFile}
        />,
      );

      fireEvent.click(screen.getByTestId('schema-open-generated'));
      expect(onOpenGeneratedFile).toHaveBeenLastCalledWith('/repo/garden.schema.ts');
      screen.getByTestId('schema-copy').focus();
      await user.tab();
      expect(screen.getByTestId('schema-open-generated')).toHaveFocus();

      await chooseOutput('schema-output-json-schema');
      fireEvent.click(screen.getByTestId('schema-open-generated'));
      expect(onOpenGeneratedFile).toHaveBeenLastCalledWith('/repo/garden.schema.json');

      await chooseOutput('schema-output-mcp-definitions');
      fireEvent.click(screen.getByTestId('schema-open-generated'));
      expect(onOpenGeneratedFile).toHaveBeenLastCalledWith(
        '/repo/.contexture/mcp-definitions.json',
      );
    });

    it('hides the external editor action before the document has a file path', () => {
      render(
        <SchemaPanel
          {...DEFAULT_PROPS}
          zodSource="zod"
          onOpenGeneratedFile={vi.fn()}
          documentFilePath={null}
        />,
      );

      expect(screen.queryByTestId('schema-open-generated')).not.toBeInTheDocument();
    });

    it('shows the JSON Schema filename when on the JSON output', async () => {
      render(
        <SchemaPanel
          {...DEFAULT_PROPS}
          zodSource="a"
          jsonSource="b"
          schemaFileName="allotment.schema.ts"
        />,
      );
      await chooseOutput('schema-output-json-schema');
      expect(screen.getByTestId('schema-filename').textContent).toContain('allotment.schema.json');
    });

    it('shows the Convex filename when on the Convex output', async () => {
      render(
        <SchemaPanel
          {...DEFAULT_PROPS}
          zodSource="a"
          convexSource="b"
          schemaFileName="allotment.schema.ts"
        />,
      );
      await chooseOutput('schema-output-convex');
      expect(screen.getByTestId('schema-filename').textContent).toContain('convex/schema.ts');
    });

    it('derives JSON filename via .ts → .json fallback when name has no .schema.ts suffix', async () => {
      render(<SchemaPanel {...DEFAULT_PROPS} zodSource="a" jsonSource="b" />);
      // Default schemaFileName is 'schema.ts' — no '.schema.ts' segment, so the
      // fallback .ts → .json replacement must fire.
      await chooseOutput('schema-output-json-schema');
      expect(screen.getByTestId('schema-filename').textContent).toContain('schema.json');
    });
  });
});
