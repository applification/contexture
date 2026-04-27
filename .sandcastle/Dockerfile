FROM oven/bun:1-debian

# Install system dependencies
RUN apt-get update && apt-get install -y \
  git \
  curl \
  jq \
  && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
  | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
  && apt-get update && apt-get install -y gh \
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
