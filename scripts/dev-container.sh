#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

require() {
  local path="$1" label="$2"
  if [ ! -e "$path" ]; then
    echo "Error: required $label missing: $path" >&2
    echo "See .devcontainer/README.md for prerequisites." >&2
    exit 1
  fi
}

require "$HOME/.claude"         "host ~/.claude"
require "$HOME/.codex"          "host ~/.codex"
require "$HOME/.gitconfig"      "host ~/.gitconfig"
require "$HOME/.config/gh"      "host ~/.config/gh"

if command -v devcontainer >/dev/null 2>&1; then
  DEVCONTAINER=(devcontainer)
elif command -v npx >/dev/null 2>&1; then
  DEVCONTAINER=(npx --yes @devcontainers/cli@latest)
else
  echo "Error: devcontainer CLI not found." >&2
  echo "Install: npm install -g @devcontainers/cli" >&2
  exit 1
fi

echo "[dev-container] devcontainer up ..."
"${DEVCONTAINER[@]}" up --workspace-folder "$REPO_ROOT"

print_mapped_port() {
  local container_port="$1" label="$2" mapping
  mapping="$(docker compose -p one_portrait port dev "$container_port" 2>/dev/null | head -n1)"
  if [ -n "$mapping" ]; then
    echo "[dev-container] $label -> http://localhost:${mapping##*:}"
  fi
}

echo "[dev-container] host port mappings:"
print_mapped_port 3000 "Next.js (3000)"
print_mapped_port 9323 "Playwright (9323)"

echo "[dev-container] entering bash in /workspace/one_portrait ..."
exec "${DEVCONTAINER[@]}" exec --workspace-folder "$REPO_ROOT" bash -lc 'cd /workspace/one_portrait && exec bash -l'
