/**
 * File-lifecycle dialogs — all three routed off `useDocumentStore`:
 *
 *   - Import warnings: shown after `load()` returns non-empty warnings
 *     (migrations applied, missing sidecar, etc.).
 *   - Unknown format: shown when the open path doesn't look like a
 *     `.contexture.json` or the JSON fails to parse against the IR
 *     meta-schema. Repurposed from the pre-pivot "cannot determine
 *     format" dialog — Contexture only has one format, so the message
 *     is specific to that.
 *   - Save-with-errors: shown when the user tries to save but the
 *     semantic validators surfaced errors. Offers "Save anyway" +
 *     "Cancel"; the caller stores the prompt with an `id` so it can
 *     match up the user's decision to the in-flight save action.
 *
 * The dialogs are declarative — any caller (menu handler, toolbar
 * button, future drag-drop) just pushes the right payload into the
 * store and this component renders it.
 */

import { useDocumentStore } from '@renderer/store/document';
import { CircleAlert, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface DocumentDialogsProps {
  /**
   * Called when the user clicks "Save anyway" in the save-with-errors
   * dialog. Receives the prompt `id` so the caller can match up the
   * user's decision to the save action they kicked off.
   */
  onForceSave?: (promptId: string) => void;
}

export function DocumentDialogs({ onForceSave }: DocumentDialogsProps): React.JSX.Element {
  const importWarnings = useDocumentStore((s) => s.importWarnings);
  const clearImportWarnings = useDocumentStore((s) => s.clearImportWarnings);
  const unknownFormatPath = useDocumentStore((s) => s.unknownFormatPath);
  const clearUnknownFormat = useDocumentStore((s) => s.clearUnknownFormat);
  const saveWithErrorsPrompt = useDocumentStore((s) => s.saveWithErrorsPrompt);
  const clearSaveWithErrors = useDocumentStore((s) => s.clearSaveWithErrors);

  return (
    <>
      <Dialog
        open={importWarnings.length > 0}
        onOpenChange={(open) => {
          if (!open) clearImportWarnings();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import warnings</DialogTitle>
            <DialogDescription>
              The file was loaded but some issues were detected.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-48 overflow-y-auto text-sm">
            {importWarnings.map((w) => (
              <div key={w.message} className="flex items-start gap-2">
                {w.severity === 'error' ? (
                  <CircleAlert className="size-4 shrink-0 mt-0.5 text-destructive" />
                ) : (
                  <TriangleAlert className="size-4 shrink-0 mt-0.5 text-warning" />
                )}
                <span>{w.message}</span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={clearImportWarnings}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={unknownFormatPath !== null}
        onOpenChange={(open) => {
          if (!open) clearUnknownFormat();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Not a Contexture file</DialogTitle>
            <DialogDescription>
              The file could not be parsed as a Contexture schema. Make sure it has the{' '}
              <code>.contexture.json</code> extension and matches the IR v1 meta-schema.
            </DialogDescription>
          </DialogHeader>
          {unknownFormatPath && (
            <p className="text-xs font-mono text-muted-foreground break-all">{unknownFormatPath}</p>
          )}
          <DialogFooter>
            <Button onClick={clearUnknownFormat}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={saveWithErrorsPrompt !== null}
        onOpenChange={(open) => {
          if (!open) clearSaveWithErrors();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save with errors?</DialogTitle>
            <DialogDescription>
              This schema has validation errors. Saving may produce a file that the editor can't
              reopen cleanly.
            </DialogDescription>
          </DialogHeader>
          {saveWithErrorsPrompt && (
            <div className="space-y-2 max-h-48 overflow-y-auto text-sm">
              {saveWithErrorsPrompt.messages.map((msg) => (
                <div key={msg} className="flex items-start gap-2">
                  <CircleAlert className="size-4 shrink-0 mt-0.5 text-destructive" />
                  <span>{msg}</span>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={clearSaveWithErrors}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const id = saveWithErrorsPrompt?.id;
                clearSaveWithErrors();
                if (id) onForceSave?.(id);
              }}
            >
              Save anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
