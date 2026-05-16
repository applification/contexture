# Agent MCP Server

Contexture exposes an MCP server for agents that need to inspect, validate,
mutate, emit, and check drift for `.contexture.json` files. The source-checkout
command is still available as `contexture-mcp`, but installed app users should
register the packaged app entrypoint so every agent uses the same central
install.

## Register the Installed App

On macOS, register the installed app with Codex:

```bash
codex mcp add contexture -- /Applications/Contexture.app/Contents/MacOS/Contexture --mcp
```

Use the real installed app path. Avoid `~/Apps` or a source checkout path for
shared agent setup, because the packaged entrypoint is the stable command users
already install and update.

## Smoke Test

After registering the server, ask Codex to list available MCP tools or inspect a
known `.contexture.json` file. The server should expose:

- `inspect_contexture`
- `validate_contexture`
- `apply_contexture_op`
- `emit_contexture`
- `check_contexture_drift`

The intended agent loop is:

1. `inspect_contexture`
2. `apply_contexture_op`
3. `validate_contexture`
4. `emit_contexture`
5. `check_contexture_drift`

`apply_contexture_op` accepts one closed-world Contexture `Op` object, such as:

```json
{
  "kind": "add_field",
  "typeName": "Customer",
  "field": { "name": "email", "type": { "kind": "string", "format": "email" } }
}
```

The apply tool writes the IR and generated bundle through the same file-backed
op path as the CLI. `emit_contexture` is available when the agent only needs to
regenerate artifacts from the current IR, and `check_contexture_drift` verifies
that generated files still match the IR.

For local release verification before packaging, build the desktop app and start
the built main entrypoint with the same flag:

```bash
bun run --filter=@contexture/desktop build
node apps/desktop/out/main/index.js --mcp
```

The process speaks MCP over stdio and should not open the desktop window.
