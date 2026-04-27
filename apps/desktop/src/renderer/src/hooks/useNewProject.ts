/**
 * `useNewProject` — wires the File → New Project… menu entry to the
 * dialog store. Intentionally minimal for the tracer slice: a single
 * subscription that flips `isOpen` when the menu fires. Later slices
 * add scaffold-event subscription, cancel wiring, and success handling
 * to this hook as the dialog grows.
 */
import { useEffect } from 'react';
import { useNewProjectStore } from '../store/new-project';

export function useNewProject(): void {
  const open = useNewProjectStore((s) => s.open);
  const fileApi = typeof window !== 'undefined' ? window.contexture?.file : undefined;

  useEffect(() => {
    if (!fileApi) return;
    const unsubscribe = fileApi.onMenuNewProject(() => open());
    return unsubscribe;
  }, [fileApi, open]);
}
