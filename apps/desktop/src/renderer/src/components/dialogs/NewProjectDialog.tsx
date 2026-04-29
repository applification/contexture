/**
 * New Project dialog — form, preflight, and live progress.
 *
 * Three views in one dialog, switched by `phase`:
 *   - `form`    — name + parent-dir inputs + app picker; inline
 *                 preflight error if the scaffolder's stage-0 checks fail.
 *   - `running` — dynamic stage rows (based on selected apps) with
 *                 running/done/pending status plus a streaming log tail.
 *   - `done` / `failed` — success and failure panels.
 *
 * Event fan-out: a single `scaffold.onEvent` subscription mutates the
 * store; components below re-render off those store slices.
 */
import { deriveStages } from '@main/scaffold/scaffold-project';
import { type PreflightError, preflightErrorCopy } from '@renderer/model/preflight-error-copy';
import { labelForStage } from '@renderer/model/scaffold-stage-labels';
import { validateProjectName } from '@renderer/model/validate-project-name';
import {
  type AppKind,
  type StageStatus,
  type StartingPoint,
  useNewProjectStore,
} from '@renderer/store/new-project';
import { FileJson, Folder } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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

const APP_OPTIONS: { kind: AppKind; label: string; description: string }[] = [
  { kind: 'web', label: 'Web', description: 'Next.js + shadcn/ui' },
  { kind: 'mobile', label: 'Mobile', description: 'Expo (React Native)' },
  { kind: 'desktop', label: 'Desktop', description: 'Electron Forge' },
];

const STARTING_POINTS: { value: StartingPoint; label: string; description: string }[] = [
  {
    value: 'new',
    label: 'Start fresh',
    description: 'Begin with an empty schema and describe it in the chat.',
  },
  {
    value: 'promote',
    label: 'Promote scratch file',
    description: 'Copy an existing .contexture.json into the new project as the initial schema.',
  },
];

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
  const apps = useNewProjectStore((s) => s.apps);
  const description = useNewProjectStore((s) => s.description);
  const startingPoint = useNewProjectStore((s) => s.startingPoint);
  const scratchPath = useNewProjectStore((s) => s.scratchPath);
  const scratchValidationError = useNewProjectStore((s) => s.scratchValidationError);
  const setName = useNewProjectStore((s) => s.setName);
  const setParentDir = useNewProjectStore((s) => s.setParentDir);
  const toggleApp = useNewProjectStore((s) => s.toggleApp);
  const setDescription = useNewProjectStore((s) => s.setDescription);
  const setStartingPoint = useNewProjectStore((s) => s.setStartingPoint);
  const setScratchPath = useNewProjectStore((s) => s.setScratchPath);
  const setScratchValidationError = useNewProjectStore((s) => s.setScratchValidationError);
  const preflightError = useNewProjectStore((s) => s.preflightError);
  const setPreflightError = useNewProjectStore((s) => s.setPreflightError);
  const clearPreflightError = useNewProjectStore((s) => s.clearPreflightError);
  const setPhase = useNewProjectStore((s) => s.setPhase);
  const setFailure = useNewProjectStore((s) => s.setFailure);
  const markStage = useNewProjectStore((s) => s.markStage);
  const appendLog = useNewProjectStore((s) => s.appendLog);
  const resetProgress = useNewProjectStore((s) => s.resetProgress);

  const nameValidation = name === '' ? { ok: true as const } : validateProjectName(name);
  const isPromoting = startingPoint === 'promote';
  const canCreate =
    name !== '' &&
    nameValidation.ok &&
    parentDir !== '' &&
    apps.length >= 1 &&
    (!isPromoting || (scratchPath !== '' && scratchValidationError === null));
  const targetPath = parentDir && name ? `${parentDir}/${name}` : '';

  const onOpenProjectRef = useRef(onOpenProject);
  onOpenProjectRef.current = onOpenProject;
  const targetPathRef = useRef(targetPath);
  targetPathRef.current = targetPath;
  const nameRef = useRef(name);
  nameRef.current = name;

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
        case 'scaffold-done': {
          const irPath = `${targetPathRef.current}/packages/contexture/${nameRef.current}.contexture.json`;
          close();
          void onOpenProjectRef.current?.(irPath);
          return;
        }
        case 'stdout-chunk':
        case 'stderr-chunk':
          appendLog(event.chunk);
          return;
      }
    });
  }, [setPreflightError, setPhase, setFailure, markStage, appendLog, close]);

  async function handlePickFolder(): Promise<void> {
    const picked = await window.contexture?.file.pickDirectory();
    if (picked) setParentDir(picked);
  }

  async function handlePickScratch(): Promise<void> {
    const picked = await window.contexture?.file.pickContextureFile();
    if (!picked) return;
    setScratchPath(picked);
    setScratchValidationError(null);
    // Basic filename heuristic — the real validation runs in handleScaffoldStart
    // on the main side via IRSchema.parse; we just surface it early here.
    if (!picked.endsWith('.contexture.json')) {
      setScratchValidationError('File must end in .contexture.json');
    }
  }

  async function handleCreate(): Promise<void> {
    if (!targetPath) return;
    clearPreflightError();
    resetProgress();
    await window.contexture?.scaffold.start({
      targetDir: targetPath,
      projectName: name,
      apps,
      description: !isPromoting && description.trim() ? description.trim() : undefined,
      scratchPath: isPromoting && scratchPath ? scratchPath : undefined,
    });
  }

  const showFailure = phase === 'failed';
  const showProgress = phase === 'running';
  const showForm = !showProgress && !showFailure;

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
            {showFailure
              ? 'Scaffolding hit a snag.'
              : showProgress
                ? 'Scaffolding your project — this usually takes a minute.'
                : 'Scaffold a Contexture monorepo under a folder you choose.'}
          </DialogDescription>
        </DialogHeader>

        {showFailure ? (
          <FailureView targetPath={targetPath} onRetry={() => void handleCreate()} />
        ) : showProgress ? (
          <ProgressView apps={apps} />
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
              <Label>Apps to include</Label>
              <p className="text-xs text-muted-foreground">
                Convex is always included. Select at least one app layer.
              </p>
              <div className="space-y-2">
                {APP_OPTIONS.map(({ kind, label, description: desc }) => (
                  <label
                    key={kind}
                    htmlFor={`app-${kind}`}
                    className="flex items-start gap-2 text-sm cursor-pointer"
                  >
                    <Checkbox
                      id={`app-${kind}`}
                      checked={apps.includes(kind)}
                      onCheckedChange={() => toggleApp(kind)}
                      aria-label={label}
                      className="mt-0.5"
                    />
                    <span>
                      {label} <span className="text-xs text-muted-foreground">({desc})</span>
                    </span>
                  </label>
                ))}
              </div>
              {apps.length === 0 && (
                <p className="text-xs text-destructive">Select at least one app.</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Starting point</Label>
              <div className="space-y-2">
                {STARTING_POINTS.map(({ value, label, description: desc }) => (
                  <label
                    key={value}
                    htmlFor={`starting-point-${value}`}
                    className="flex items-start gap-2 text-sm cursor-pointer"
                  >
                    <input
                      type="radio"
                      id={`starting-point-${value}`}
                      name="starting-point"
                      value={value}
                      checked={startingPoint === value}
                      onChange={() => setStartingPoint(value)}
                      className="mt-0.5 accent-primary"
                    />
                    <span>
                      {label} <span className="text-xs text-muted-foreground">— {desc}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {isPromoting ? (
              <div className="space-y-2">
                <Label>Scratch file</Label>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => void handlePickScratch()}>
                    <FileJson className="size-4" />
                    Choose .contexture.json…
                  </Button>
                  {scratchPath && (
                    <span className="text-xs font-mono text-muted-foreground truncate">
                      {scratchPath.split('/').pop()}
                    </span>
                  )}
                </div>
                {scratchValidationError && (
                  <p className="text-xs text-destructive">{scratchValidationError}</p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="new-project-description">
                  Initial prompt{' '}
                  <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id="new-project-description"
                  rows={3}
                  placeholder="A photo-sharing app where users post and like photos…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Seeded into the chat when you open the project. Claude will build your schema from
                  this.
                </p>
              </div>
            )}

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

function ProgressView({ apps }: { apps: AppKind[] }): React.JSX.Element {
  const stageStates = useNewProjectStore((s) => s.stageStates);
  const log = useNewProjectStore((s) => s.log);
  const stages = deriveStages(apps);

  return (
    <div className="space-y-3">
      <ul className="space-y-1">
        {stages.map((n) => {
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
