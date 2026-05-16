# Agent MCP Server

Contexture exposes a read-only MCP server for agents that need to inspect or
validate `.contexture.json` files. The source-checkout command is still
available as `contexture-mcp`, but installed app users should register the
packaged app entrypoint so every agent uses the same central install.

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

For local release verification before packaging, build the desktop app and start
the built main entrypoint with the same flag:

```bash
bun run --filter=@contexture/desktop build
node apps/desktop/out/main/index.js --mcp
```

The process speaks MCP over stdio and should not open the desktop window.
