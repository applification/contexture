/**
 * New Project dialog — tracer shell.
 *
 * This slice proves the end-to-end wiring: menu click in main process
 * → IPC → `useNewProjectStore.open()` → dialog renders. Subsequent
 * slices replace the placeholder body with the real form (name, parent
 * dir picker, starting point), the progress modal, and the success
 * panel. The dialog is intentionally unstyled beyond a title + Cancel
 * button so the tests assert behaviour rather than chrome.
 */
import { useNewProjectStore } from '@renderer/store/new-project';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function NewProjectDialog(): React.JSX.Element {
  const isOpen = useNewProjectStore((s) => s.isOpen);
  const close = useNewProjectStore((s) => s.close);

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
            Scaffold a Contexture monorepo. The form lands in a later slice.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
