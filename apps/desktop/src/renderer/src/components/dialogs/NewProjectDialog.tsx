/**
 * New Project dialog — form slice.
 *
 * Collects the name + parent directory and shows the computed target
 * path. Name input live-validates against `validateProjectName`; the
 * Create button unlocks when the name is valid and a parent has been
 * picked. Parent dir uses the OS folder picker through
 * `window.contexture.file.pickDirectory`.
 *
 * Create is intentionally a no-op here; the next slice wires it to the
 * scaffold pre-flight + progress modal.
 */
import { validateProjectName } from '@renderer/model/validate-project-name';
import { useNewProjectStore } from '@renderer/store/new-project';
import { Folder } from 'lucide-react';
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

  const nameValidation = name === '' ? { ok: true as const } : validateProjectName(name);
  const canCreate = name !== '' && nameValidation.ok && parentDir !== '';
  const targetPath = parentDir && name ? `${parentDir}/${name}` : '';

  async function handlePickFolder(): Promise<void> {
    const picked = await window.contexture?.file.pickDirectory();
    if (picked) setParentDir(picked);
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button disabled={!canCreate}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
