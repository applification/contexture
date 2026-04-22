/**
 * EvalPanel — UI over `useClaudeEval`.
 *
 * Controls:
 *   - Root type dropdown (non-imported TypeDefs only).
 *   - Mode dropdown (realistic / minimal / edge-case / adversarial).
 *   - Grounding textarea (optional free text that gets embedded in the
 *     system prompt).
 *   - User prompt input (optional; falls back to a default).
 *   - Generate button (disabled while running or no root picked).
 *   - Result pane: sample JSON + validation verdict.
 *   - Actions: Regenerate, Save as fixture, Copy JSON.
 *
 * The panel is pure UI over the hook's state; tests can exercise the
 * hook directly without rendering.
 */
import { useState } from 'react';
import type { EvalMode } from '../../chat/eval-prompt';
import type { useClaudeEval } from '../../chat/useClaudeEval';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';

const MODES: EvalMode[] = ['realistic', 'minimal', 'edge-case', 'adversarial'];

export interface EvalPanelProps {
  eval: ReturnType<typeof useClaudeEval>;
  /** Candidate root type names (from `evalRootCandidates(ir)`). */
  rootCandidates: string[];
  /** Copy JSON to clipboard — host wires to `navigator.clipboard`. */
  onCopy?: (json: string) => void;
}

export function EvalPanel({ eval: ev, rootCandidates, onCopy }: EvalPanelProps) {
  const { state } = ev;
  const [fixtureName, setFixtureName] = useState('sample');
  const isRunning = state.status === 'running';

  const sampleJson = state.sample !== null ? JSON.stringify(state.sample, null, 2) : '';

  return (
    <div className="flex h-full flex-col gap-3 p-3" data-testid="eval-panel">
      <div className="grid grid-cols-2 gap-2">
        <Label htmlFor="eval-root" className="space-y-1">
          <span>Root type</span>
          <select
            id="eval-root"
            value={state.rootTypeName ?? ''}
            onChange={(e) => ev.setRoot(e.target.value || null)}
            data-testid="eval-root-select"
            className="w-full rounded border border-border bg-background p-1"
          >
            <option value="">(pick one)</option>
            {rootCandidates.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </Label>
        <Label htmlFor="eval-mode" className="space-y-1">
          <span>Mode</span>
          <select
            id="eval-mode"
            value={state.mode}
            onChange={(e) => ev.setMode(e.target.value as EvalMode)}
            data-testid="eval-mode-select"
            className="w-full rounded border border-border bg-background p-1"
          >
            {MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Label>
      </div>

      <Label htmlFor="eval-grounding" className="space-y-1">
        <span>Grounding (optional)</span>
        <Textarea
          id="eval-grounding"
          value={state.grounding}
          onChange={(e) => ev.setGrounding(e.target.value)}
          rows={2}
          placeholder="Prefer names from Welsh folklore…"
        />
      </Label>

      <Label htmlFor="eval-prompt" className="space-y-1">
        <span>Prompt (optional)</span>
        <Input
          id="eval-prompt"
          value={state.userPrompt}
          onChange={(e) => ev.setUserPrompt(e.target.value)}
          placeholder="Leave blank to use the default."
        />
      </Label>

      <div className="flex gap-2">
        <Button
          size="sm"
          type="button"
          onClick={() => ev.generate()}
          disabled={!state.rootTypeName || isRunning}
        >
          {state.sample ? 'Regenerate' : 'Generate'}
        </Button>
        <Button
          size="sm"
          type="button"
          variant="outline"
          onClick={() => onCopy?.(sampleJson)}
          disabled={!sampleJson}
        >
          Copy JSON
        </Button>
      </div>

      {state.status === 'error' && (
        <p data-testid="eval-error" className="text-xs text-destructive">
          {state.error}
        </p>
      )}

      {state.validation && (
        <p
          data-testid="eval-validation"
          className={`text-xs ${state.validation.ok ? 'text-green-600' : 'text-destructive'}`}
        >
          {state.validation.ok
            ? 'Valid against the root Zod schema.'
            : `${state.validation.errors?.length ?? 0} validation error(s).`}
        </p>
      )}

      {state.sample !== null && (
        <div className="flex-1 overflow-auto rounded border border-border p-2">
          <pre className="text-xs" data-testid="eval-sample">
            {sampleJson}
          </pre>
        </div>
      )}

      {state.sample !== null && (
        <div className="flex items-center gap-2">
          <Input
            value={fixtureName}
            onChange={(e) => setFixtureName(e.target.value)}
            placeholder="fixture name"
            className="max-w-[240px]"
            data-testid="eval-fixture-name"
          />
          <Button
            size="sm"
            type="button"
            variant="secondary"
            onClick={() => ev.saveFixture(fixtureName.trim() || 'sample')}
            disabled={!state.validation?.ok}
          >
            Save fixture
          </Button>
        </div>
      )}
    </div>
  );
}
