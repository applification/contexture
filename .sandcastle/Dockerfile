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

# Claude Code's install creates ~/.claude and ~/.claude.json owned by UID 1000.
# Sandcastle runs the container as the host UID, so make them world-writable
# (the install script also writes a starter .claude.json that Claude updates
# on each run — non-writable config makes Claude hang silently).
RUN chmod -R a+rwX /home/agent/.claude /home/agent/.claude.json /home/agent/.local

# Add Claude to PATH
ENV PATH="/home/agent/.local/bin:$PATH"

WORKDIR /home/agent

# In worktree sandbox mode, Sandcastle bind-mounts the git worktree at /home/agent/workspace
# and overrides the working directory to /home/agent/workspace at container start.
# Structure your Dockerfile so that /home/agent/workspace can serve as the project root.
ENTRYPOINT ["sleep", "infinity"]
