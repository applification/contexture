# Contexture CLI and MCP

The release package runs on **Node 24.x** on macOS, Linux and Windows. It includes
compiled JavaScript and Contexture's standard library. Bun is only used to build
the release; consumers do not need Bun, Electron, compilers or installation scripts.
Public JavaScript dependencies are installed by pnpm and pinned in your lockfile.

## Install a completed release

```sh
pnpm add -D -E @applification/contexture --ignore-scripts
pnpm exec contexture --help
pnpm exec contexture --version
```

Commit `package.json` and `pnpm-lock.yaml`. `-E` saves the resolved version exactly.
The package contains both `contexture` and `contexture-mcp`; no global installation
or registry credentials are needed by consumers. To select a particular release:

```sh
pnpm add -D -E @applification/contexture@0.15.52 --ignore-scripts
```

Version `0.15.52` is the first npm release. CI and production builds must use the
committed lockfile rather than resolving `latest` independently on every build.

## Use the project tooling

Run commands from the consuming package's directory:

```sh
pnpm exec contexture inspect --ir packages/contexture/app.contexture.json --json
pnpm exec contexture validate --ir packages/contexture/app.contexture.json --json
pnpm exec contexture emit --ir packages/contexture/app.contexture.json --json
pnpm exec contexture check-generated --ir packages/contexture/app.contexture.json --json
pnpm exec contexture convex-capabilities --json
```

Without `--ir`, Contexture searches `packages/contexture` and then the current
directory for a single `.contexture.json` file. Failed validation and generated
file drift return exit code 1. `convex-capabilities` examines the Convex package
installed in this consumer or its workspace ancestors and invokes that exact
package's CLI with Node. Install your intended Convex version in the consumer
first; Contexture never downloads one or substitutes its own build dependency.

For a project-local MCP client, set its working directory to the project root
and use this stdio server configuration:

```json
{
  "mcpServers": {
    "contexture": {
      "command": "node",
      "args": ["./node_modules/@applification/contexture/dist/mcp.js"]
    }
  }
}
```

This works on all three platforms without a shell or a global install. For clients
that do not launch from the project root, use an absolute path to this project's
`node_modules/@applification/contexture/dist/mcp.js`. Supply absolute `irPath` values in MCP
tool calls. The server reports the release version during initialization and
validation; stdout carries only MCP messages during normal server operation.
`contexture-mcp --version` is a separate command that prints the version and exits.

## CI and production builds

Use Node 24 and your project's pinned pnpm version, then:

```sh
pnpm install --frozen-lockfile --ignore-scripts --prod=false
pnpm exec contexture validate --ir packages/contexture/app.contexture.json --json
pnpm exec contexture check-generated --ir packages/contexture/app.contexture.json --json
pnpm run build
```

`--prod=false` includes build tools even when `NODE_ENV=production`. If other
dependencies require lifecycle scripts, follow your project's policy for those;
Contexture itself requires none. Include dev dependencies in the build stage,
then omit them from the deployed runtime. Contexture is development/build tooling:
deployed applications consume generated code and do not need a running CLI or MCP
server. Generated Zod/Convex code still needs its normal application dependencies.

## Discover and upgrade deliberately

Read [the release notes](https://github.com/applification/contexture/releases/latest)
and check for an update when preparing an upgrade:

```sh
pnpm outdated @applification/contexture
pnpm add -D -E @applification/contexture@latest --ignore-scripts
pnpm exec contexture --version
pnpm exec contexture validate --ir packages/contexture/app.contexture.json --json
pnpm exec contexture emit --ir packages/contexture/app.contexture.json --json
pnpm exec contexture check-generated --ir packages/contexture/app.contexture.json --json
```

Review the generated changes and run your application's tests/build. Commit the
updated exact dependency version, lockfile and reviewed generated outputs together.
Subsequent frozen installs reproduce that selection and verify the package integrity.
The same `pnpm add` command migrates an existing GitHub URL dependency to npm.

Updating the desktop alone does **not** update a project's locked CLI dependency.
Both use the shared generation engine, but different releases may generate
different output. Project-aware desktop engine selection is a separate follow-up.

## GitHub tarball alternative

The same package is also attached to each matching GitHub Release, with a SHA-256
checksum. Replace `VERSION` with an explicit completed release version:

```sh
pnpm add -D @applification/contexture@https://github.com/applification/contexture/releases/download/vVERSION/contexture-cli-VERSION.tgz --ignore-scripts
gh release download vVERSION --repo applification/contexture --pattern 'contexture-cli-VERSION.tgz*'
```

Commit the version-specific URL and lockfile. Avoid floating download URLs in builds.
Older desktop-only releases have no CLI tarball. The `contexture-cli-VERSION.tgz`
asset name is retained even though the package name is `@applification/contexture`.

## Maintainer release checks

Bump `packages/cli/package.json` and `apps/desktop/package.json` together, refresh
`bun.lock`, and tag that exact source as `vVERSION` through the normal review flow.
The pack command fails if either version or the supplied tag differs:

```sh
bun install --frozen-lockfile
bun run --cwd packages/cli pack:release vVERSION
node packages/cli/scripts/verify-package.ts packages/cli/dist/release
```

The verifier requires Node 24, pnpm and Git. It serves the actual tarball through a
disposable npm-compatible registry to a consumer outside the checkout, restricts PATH to
exclude Bun, tests scripts-disabled installation and CLI/MCP behavior, commits a
lockfile in the disposable repository, and reinstalls a fresh clone. CI runs the
same artifact on all supported OSes without checking out Contexture or installing
Bun in the consumer jobs. Public registry access is needed for public dependencies.
Its arguments are `artifact-directory [path-to-pnpm.cjs] [registry|tarball|npm]`.
`registry` (default) tests installation by name against the disposable registry;
`tarball` tests the version-specific HTTP URL; `npm` tests the actual published version.

GitHub Releases receives the tarball and SHA-256 file only after that matrix passes.
Desktop installers and auto-update metadata are still produced by electron-builder.
After all desktop assets and update-file checksums are verified, the release workflow
publishes that exact tarball to npm. It compares registry integrity and downloaded
bytes against the tested artifact, runs the real npm install tests on all three OSes,
and only then publishes the GitHub draft as latest. The workspace manifest remains
private to prevent accidental publication of TypeScript sources; publish the built
tarball, not the workspace directory. Its generated manifest is public.

New publications can be visible on npm's website and version endpoints before they
are installable. npm's [publish-time scanning](https://github.blog/changelog/2026-07-28-npm-publish-time-malware-scanning-and-dual-use-metadata/)
typically delays availability by about five minutes and can take longer. The publish
job checks the package-manager install index every 30 seconds for up to 20 minutes
before starting consumer tests. It logs pending availability, never republishes the
version, and leaves GitHub as a draft if the wait expires. Once npm makes the version
available, rerun failed jobs on the same tag.

npm and GitHub cannot be published atomically. If npm succeeds and a later step fails,
the npm version remains published and GitHub remains a draft. Rerun failed jobs on
the same tag; a matching published artifact is reused, and a different artifact for
that version fails loudly. Never overwrite/rebuild an already-published version or
manually publish an incomplete GitHub draft. A code fix requires a new version.

## npm publishing setup

The npm account owning `@applification` must perform the first publication. After
the first tagged build has passed the pre-publication checks, download its verified
`contexture-cli` workflow artifact (including the tarball, checksum, manifest and
release scripts) and publish it from an authenticated terminal:

```sh
npm login --registry=https://registry.npmjs.org
node artifact/npm-release.js publish artifact
```

Use the verified workflow artifact from that tag, not a fresh local rebuild. An npm
2FA prompt may require the account owner's interaction. Once the package exists,
configure its **Trusted Publisher** on npmjs.com:

- Provider: GitHub Actions
- Organization/user: `applification`
- Repository: `contexture`
- Workflow filename: `release.yml`
- Environment: leave empty (the workflow does not name an environment)
- Allow direct `npm publish` (stage-only permission cannot run this workflow)

With npm 11.15+ and an authenticated owner account, the equivalent command is:

```sh
npm trust github @applification/contexture --repo=applification/contexture --file=release.yml --allow-publish --yes
```

Rerun the failed release jobs. Future tagged releases use GitHub OIDC and automatic
provenance; no npm publishing token is stored in GitHub. The workflow pins npm
11.16.0 and Node 24 and grants `id-token: write` only to the publishing job.
The first interactive publication does not receive GitHub OIDC provenance.

References: [pnpm add](https://pnpm.io/cli/add),
[frozen installs](https://pnpm.io/cli/install),
[npm trusted publishing](https://docs.npmjs.com/trusted-publishers/),
[GitHub release publication](https://cli.github.com/manual/gh_release_edit).
