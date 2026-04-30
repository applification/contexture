FROM oven/bun:1-debian

# Install system dependencies
RUN apt-get update && apt-get install -y \
  git \
  curl \
  jq \
  ca-certificates \
  gnupg \
  xvfb \
  && rm -rf /var/lib/apt/lists/*

# Install Node.js 24 (matches CI: actions/setup-node node-version: 24).
# Playwright and electron-builder both expect a real `node` on PATH.
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
  && apt-get install -y nodejs \
  && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
  | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
  && apt-get update && apt-get install -y gh \
  && rm -rf /var/lib/apt/lists/*

# Playwright + Electron runtime libraries (mirrors .github/workflows/ci.yml
# `e2e-electron` job). Lets the sandbox run `apps/web` Playwright tests and
# `apps/desktop` Electron Playwright tests under xvfb, the same way CI does.
RUN apt-get update && apt-get install -y \
  libnss3 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libasound2t64 \
  libpango-1.0-0 \
  libcairo2 \
  libx11-xcb1 \
  && rm -rf /var/lib/apt/lists/*

# Install turbo globally
RUN bun install -g turbo

# The oven/bun image already has a "bun" user (UID 1000).
RUN usermod -d /home/agent -m -l agent bun
# oven/bun's home dir is mode 700 (vs 755 on node:slim). Sandcastle runs the
# container as the host UID (not the agent UID 1000), so /home/agent must be
# both traversable AND writable for any UID — git needs to create .gitconfig
# at runtime.
RUN chmod 1777 /home/agent

USER agent

# Install Claude Code CLI
RUN curl -fsSL https://claude.ai/install.sh | bash

# Claude Code's install creates ~/.claude, ~/.claude.json, and ~/.cache
# owned by UID 1000. Sandcastle runs the container as the host UID, so
# anything the runtime UID needs to read or write must be made world-
# writable (otherwise Claude hangs silently on its config, and bun
# install's postinstall scripts — electron, etc. — fail trying to write
# their per-tool subdirs under ~/.cache).
RUN chmod -R a+rwX /home/agent/.claude /home/agent/.claude.json /home/agent/.local /home/agent/.cache /home/agent/.npm

# Add Claude to PATH and pin HOME for non-passwd UIDs. When sandcastle
# runs the container as the host UID (which has no /etc/passwd entry),
# $HOME defaults to "/" — bun install then tries to mkdir /.cache and
# fails. Fixing HOME here lets every tool write to /home/agent/.cache
# as intended.
#
# Also pre-resolve the workspace binaries the agents need. bun hoists
# per-workspace, so the canonical path for `tsc` and `vitest` is the
# workspace's own node_modules/.bin (root only has hoisted-to-root tools
# like biome). Putting these on PATH means agents stop burning calls on
# `which tsc` / `find -name vitest`.
ENV PATH="/home/agent/workspace/apps/desktop/node_modules/.bin:/home/agent/workspace/node_modules/.bin:/home/agent/.local/bin:$PATH"
ENV HOME=/home/agent

# Sandcastle runs the container as the host UID, which has no write access to
# the repo's .turbo/cache (owned by the host user inside the bind mount).
# Pre-set TURBO_CACHE_DIR to a world-writable tmpfs path so `bun run ci` and
# the husky pre-commit hook stop failing for permission reasons.
ENV TURBO_CACHE_DIR=/tmp/turbo-cache
RUN mkdir -p /tmp/turbo-cache && chmod 1777 /tmp/turbo-cache

WORKDIR /home/agent

# In worktree sandbox mode, Sandcastle bind-mounts the git worktree at /home/agent/workspace
# and overrides the working directory to /home/agent/workspace at container start.
# Structure your Dockerfile so that /home/agent/workspace can serve as the project root.
ENTRYPOINT ["sleep", "infinity"]
