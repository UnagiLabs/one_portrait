FROM mcr.microsoft.com/playwright:v1.59.1-jammy

ARG NODE_MAJOR=24
ARG CLAUDE_CODE_TARGET=latest
ARG CODEX_TARGET=latest

RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      bubblewrap \
      ca-certificates \
      curl \
      fzf \
      git \
      gnupg2 \
      jq \
      less \
      man-db \
      nano \
      ncurses-term \
      procps \
      sudo \
      unzip \
      vim \
      zsh \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | gpg --dearmor --batch --yes -o /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
      | gpg --dearmor --batch --yes -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
      > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends gh nodejs \
    && mkdir -p /workspace /home/pwuser/.claude /home/pwuser/.codex /home/pwuser/.cache/ms-playwright /home/pwuser/.local \
    && touch /home/pwuser/.zshrc \
    && chown -R pwuser:pwuser /workspace /home/pwuser \
    && rm -rf /var/lib/apt/lists/*

ENV PATH="/home/pwuser/.local/bin:${PATH}"
ENV NPM_CONFIG_PREFIX=/home/pwuser/.local
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV CLAUDE_CONFIG_DIR=/home/pwuser/.claude
ENV CODEX_HOME=/home/pwuser/.codex
ENV TERM=xterm-256color
ENV COLORTERM=truecolor
ENV SHELL=/bin/zsh
ENV EDITOR=nano
ENV VISUAL=nano

USER pwuser
WORKDIR /tmp
RUN npm install -g "@openai/codex@${CODEX_TARGET}" \
    && curl -fsSL https://claude.ai/install.sh | bash -s "${CLAUDE_CODE_TARGET}"

WORKDIR /workspace

CMD ["bash"]
