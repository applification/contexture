/**
 * Phase 2 placeholder. The real App surface is rebuilt IR-first across
 * issues #80-#101 (graph, chat, detail panels, eval, etc.). Until those
 * slices land, we render a stub so the app still boots during development.
 */
export default function App() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Contexture</h1>
        <p className="mt-2 text-sm text-muted-foreground">Phase 2 rebuild in progress.</p>
      </div>
    </div>
  );
}
