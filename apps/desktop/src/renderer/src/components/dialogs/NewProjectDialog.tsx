/**
 * New Project dialog — form, preflight, and live progress.
 *
 * Three views in one dialog, switched by `phase`:
 *   - `form`    — name + parent-dir inputs; inline preflight error if
 *                 the scaffolder's stage-0 checks fail.
 *   - `running` — ten stage rows with running/done/pending status plus
 *                 a streaming log tail from stdout/stderr chunks.
 *   - `done` / `failed` — land in later slices.
 *
 * Event fan-out: a single `scaffold.onEvent` subscription mutates the
 * store; components below re-render off those store slices.
 */
import { type PreflightError, preflightErrorCopy } from '@renderer/model/preflight-error-copy';
import { labelForStage } from '@renderer/model/scaffold-stage-labels';
import { validateProjectName } from '@renderer/model/validate-project-name';
import { type StageStatus, useNewProjectStore } from '@renderer/store/new-project';
import { Folder } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const STAGE_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export interface NewProjectDialogProps {
  /** Called with the scaffolded IR path when the user dismisses the success panel. */
  onOpenProject?: (irPath: string) => void;
}

export function NewProjectDialog({ onOpenProject }: NewProjectDialogProps = {}): React.JSX.Element {
  const isOpen = useNewProjectStore((s) => s.isOpen);
  const close = useNewProjectStore((s) => s.close);
  const phase = useNewProjectStore((s) => s.phase);
  const name = useNewProjectStore((s) => s.name);
  const parentDir = useNewProjectStore((s) => s.parentDir);
  const setName = useNewProjectStore((s) => s.setName);
  const setParentDir = useNewProjectStore((s) => s.setParentDir);
  const startingPoint = useNewProjectStore((s) => s.startingPoint);
  const description = useNewProjectStore((s) => s.description);
  const setStartingPoint = useNewProjectStore((s) => s.setStartingPoint);
  const setDescription = useNewProjectStore((s) => s.setDescription);
  const preflightError = useNewProjectStore((s) => s.preflightError);
  const setPreflightError = useNewProjectStore((s) => s.setPreflightError);
  const clearPreflightError = useNewProjectStore((s) => s.clearPreflightError);
  const setPhase = useNewProjectStore((s) => s.setPhase);
  const setFailure = useNewProjectStore((s) => s.setFailure);
  const markStage = useNewProjectStore((s) => s.markStage);
  const appendLog = useNewProjectStore((s) => s.appendLog);
  const resetProgress = useNewProjectStore((s) => s.resetProgress);

  const nameValidation = name === '' ? { ok: true as const } : validateProjectName(name);
  const startingPointValid = startingPoint === 'describe' && description.trim() !== '';
  const canCreate = name !== '' && nameValidation.ok && parentDir !== '' && startingPointValid;
  const targetPath = parentDir && name ? `${parentDir}/${name}` : '';

  useEffect(() => {
    const scaffold = window.contexture?.scaffold;
    if (!scaffold) return;
    return scaffold.onEvent((event) => {
      switch (event.kind) {
        case 'preflight-failed':
          setPreflightError(event.error as PreflightError);
          return;
        case 'stage-start':
          setPhase('running');
          markStage(event.stage, 'running');
          return;
        case 'stage-done':
          markStage(event.stage, 'done');
          return;
        case 'stage-failed':
          markStage(event.stage, 'failed');
          setFailure({ stage: event.stage, stderr: event.stderr, retrySafe: event.retrySafe });
          appendLog(event.stderr);
          return;
        case 'scaffold-done':
          setPhase('done');
          return;
        case 'stdout-chunk':
        case 'stderr-chunk':
          appendLog(event.chunk);
          return;
      }
    });
  }, [setPreflightError, setPhase, setFailure, markStage, appendLog]);

  async function handlePickFolder(): Promise<void> {
    const picked = await window.contexture?.file.pickDirectory();
    if (picked) setParentDir(picked);
  }

  async function handleCreate(): Promise<void> {
    if (!targetPath) return;
    clearPreflightError();
    resetProgress();
    await window.contexture?.scaffold.start({ targetDir: targetPath, projectName: name });
  }

  const showSuccess = phase === 'done';
  const showFailure = phase === 'failed';
  const showProgress = phase === 'running';
  const showForm = !showProgress && !showSuccess && !showFailure;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
          <DialogDescription>
            {showSuccess
              ? 'Your project is ready.'
              : showFailure
                ? 'Scaffolding hit a snag.'
                : showProgress
                  ? 'Scaffolding your project — this usually takes a minute.'
                  : 'Scaffold a Contexture monorepo under a folder you choose.'}
          </DialogDescription>
        </DialogHeader>

        {showSuccess ? (
          <SuccessView
            targetPath={targetPath}
            irPath={`${targetPath}/packages/schema/${name}.contexture.json`}
            logPath={`${targetPath}/.contexture/scaffold.log`}
            onOpenProject={onOpenProject}
          />
        ) : showFailure ? (
          <FailureView targetPath={targetPath} onRetry={() => void handleCreate()} />
        ) : showProgress ? (
          <ProgressView />
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-project-name">Project name</Label>
              <Input
                id="new-project-name"
                autoFocus
                placeholder="my-proj"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              {!nameValidation.ok && (
                <p className="text-xs text-destructive">{nameValidation.reason}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Parent folder</Label>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => void handlePickFolder()}>
                  <Folder className="size-4" />
                  Choose folder…
                </Button>
                {parentDir && (
                  <span className="text-xs font-mono text-muted-foreground truncate">
                    {parentDir}
                  </span>
                )}
              </div>
            </div>

            {targetPath && (
              <div className="space-y-1">
                <Label>Target path</Label>
                <p className="text-xs font-mono text-muted-foreground break-all">{targetPath}</p>
              </div>
            )}

            <div className="space-y-2">
              <Label>Starting point</Label>
              <div className="space-y-2">
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="starting-point"
                    className="mt-1"
                    checked={startingPoint === 'describe'}
                    onChange={() => setStartingPoint('describe')}
                    aria-label="Describe what you're building"
                  />
                  <span>Describe what you're building</span>
                </label>
                <label className="flex items-start gap-2 text-sm cursor-not-allowed text-muted-foreground">
                  <input
                    type="radio"
                    name="starting-point"
                    className="mt-1"
                    disabled
                    aria-label="Promote an existing scratch file"
                  />
                  <span>
                    Promote an existing scratch file{' '}
                    <span className="text-xs">(coming soon — #124)</span>
                  </span>
                </label>
              </div>
              {startingPoint === 'describe' && (
                <div className="space-y-1">
                  <Label htmlFor="new-project-description">Describe your project</Label>
                  <Textarea
                    id="new-project-description"
                    rows={3}
                    placeholder="A photo-sharing app where users post and like photos…"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              )}
            </div>

            {preflightError && (
              <p className="text-sm text-destructive" role="alert">
                {preflightErrorCopy(preflightError)}
              </p>
            )}
          </div>
        )}

        {showForm && (
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button disabled={!canCreate} onClick={() => void handleCreate()}>
              Create
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SuccessView({
  targetPath,
  irPath,
  logPath,
  onOpenProject,
}: {
  targetPath: string;
  irPath: string;
  logPath: string;
  onOpenProject?: (irPath: string) => void;
}): React.JSX.Element {
  const close = useNewProjectStore((s) => s.close);
  function handleClose(): void {
    onOpenProject?.(irPath);
    close();
  }
  return (
    <div data-testid="scaffold-success" className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <span role="img" aria-label="success">
          ✓
        </span>
        <span>Project scaffolded successfully.</span>
      </div>
      <div className="space-y-1">
        <Label>Location</Label>
        <p className="text-xs font-mono text-muted-foreground break-all">{targetPath}</p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" onClick={() => void window.contexture?.shell.reveal(targetPath)}>
          Reveal
        </Button>
        <Button variant="outline" onClick={() => void navigator.clipboard.writeText(targetPath)}>
          Copy path
        </Button>
        <Button variant="outline" onClick={() => void window.contexture?.shell.reveal(logPath)}>
          View log
        </Button>
        <Button data-testid="scaffold-success-close" onClick={handleClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

function FailureView({
  targetPath,
  onRetry,
}: {
  targetPath: string;
  onRetry: () => void;
}): React.JSX.Element {
  const failure = useNewProjectStore((s) => s.failure);
  const close = useNewProjectStore((s) => s.close);
  const setPhase = useNewProjectStore((s) => s.setPhase);
  const resetProgress = useNewProjectStore((s) => s.resetProgress);
  const stageLabel = failure ? labelForStage(failure.stage) : '';

  async function handleDelete(): Promise<void> {
    if (!targetPath) return;
    const confirmed = window.confirm(
      `Delete ${targetPath} and start over? This removes everything under that folder.`,
    );
    if (!confirmed) return;
    await window.contexture?.project.deleteDirectory(targetPath);
    resetProgress();
    setPhase('form');
  }
  return (
    <div data-testid="scaffold-failure" className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-destructive">
        <span role="img" aria-label="failed">
          ✗
        </span>
        <span>Failed at: {stageLabel}</span>
      </div>
      {failure?.stderr && (
        <pre className="text-xs font-mono bg-muted rounded p-2 max-h-40 overflow-auto whitespace-pre-wrap">
          {failure.stderr}
        </pre>
      )}
      <p className="text-xs text-muted-foreground">
        {failure?.retrySafe
          ? 'This stage is safe to retry against the same folder.'
          : 'Earlier stages touched the target folder. Delete it and start over to retry.'}
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" onClick={() => void window.contexture?.shell.reveal(targetPath)}>
          Open folder
        </Button>
        <Button variant="outline" onClick={() => void handleDelete()}>
          Delete and start over
        </Button>
        <Button variant="outline" onClick={close}>
          Close
        </Button>
        <Button disabled={!failure?.retrySafe} onClick={onRetry}>
          Try again
        </Button>
      </div>
    </div>
  );
}

function ProgressView(): React.JSX.Element {
  const stageStates = useNewProjectStore((s) => s.stageStates);
  const log = useNewProjectStore((s) => s.log);

  return (
    <div className="space-y-3">
      <ul className="space-y-1">
        {STAGE_NUMBERS.map((n) => {
          const status = stageStates[n] ?? 'pending';
          return (
            <li
              key={n}
              data-testid={`scaffold-stage-${n}`}
              data-status={status}
              className="flex items-center gap-2 text-sm"
            >
              <StatusGlyph status={status} />
              <span className={status === 'pending' ? 'text-muted-foreground' : ''}>
                {labelForStage(n)}
              </span>
            </li>
          );
        })}
      </ul>

      <pre
        data-testid="scaffold-log"
        className="text-xs font-mono bg-muted rounded p-2 max-h-40 overflow-auto whitespace-pre-wrap"
      >
        {log || ' '}
      </pre>
    </div>
  );
}

function StatusGlyph({ status }: { status: StageStatus }): React.JSX.Element {
  switch (status) {
    case 'done':
      return (
        <span role="img" aria-label="done">
          ✓
        </span>
      );
    case 'running':
      return (
        <span role="img" aria-label="running">
          …
        </span>
      );
    case 'failed':
      return (
        <span role="img" aria-label="failed">
          ✗
        </span>
      );
    default:
      return (
        <span role="img" aria-label="pending">
          ·
        </span>
      );
  }
}
