/**
 * New Project dialog — form + preflight slice.
 *
 * Collects the name + parent directory, shows the computed target path,
 * and invokes the scaffolder pre-flight on Create. A failed preflight
 * renders inline error copy (mapped from the tagged `PreflightError`)
 * so the user can fix the problem without leaving the dialog. The live
 * progress UI lands in the next slice.
 */
import { type PreflightError, preflightErrorCopy } from '@renderer/model/preflight-error-copy';
import { validateProjectName } from '@renderer/model/validate-project-name';
import { useNewProjectStore } from '@renderer/store/new-project';
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

export function NewProjectDialog(): React.JSX.Element {
  const isOpen = useNewProjectStore((s) => s.isOpen);
  const close = useNewProjectStore((s) => s.close);
  const name = useNewProjectStore((s) => s.name);
  const parentDir = useNewProjectStore((s) => s.parentDir);
  const setName = useNewProjectStore((s) => s.setName);
  const setParentDir = useNewProjectStore((s) => s.setParentDir);
  const preflightError = useNewProjectStore((s) => s.preflightError);
  const setPreflightError = useNewProjectStore((s) => s.setPreflightError);
  const clearPreflightError = useNewProjectStore((s) => s.clearPreflightError);
  const setPhase = useNewProjectStore((s) => s.setPhase);

  const nameValidation = name === '' ? { ok: true as const } : validateProjectName(name);
  const canCreate = name !== '' && nameValidation.ok && parentDir !== '';
  const targetPath = parentDir && name ? `${parentDir}/${name}` : '';

  useEffect(() => {
    const scaffold = window.contexture?.scaffold;
    if (!scaffold) return;
    return scaffold.onEvent((event) => {
      if (event.kind === 'preflight-failed') {
        setPreflightError(event.error as PreflightError);
      } else if (event.kind === 'stage-start') {
        setPhase('running');
      }
    });
  }, [setPreflightError, setPhase]);

  async function handlePickFolder(): Promise<void> {
    const picked = await window.contexture?.file.pickDirectory();
    if (picked) setParentDir(picked);
  }

  async function handleCreate(): Promise<void> {
    if (!targetPath) return;
    clearPreflightError();
    await window.contexture?.scaffold.start({ targetDir: targetPath, projectName: name });
  }

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
            Scaffold a Contexture monorepo under a folder you choose.
          </DialogDescription>
        </DialogHeader>

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

          {preflightError && (
            <p className="text-sm text-destructive" role="alert">
              {preflightErrorCopy(preflightError)}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button disabled={!canCreate} onClick={() => void handleCreate()}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
