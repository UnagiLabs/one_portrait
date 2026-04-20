#!/usr/bin/env bash
set -euo pipefail

HOST_CLAUDE_DIR="${HOST_CLAUDE_DIR:-/mnt/host-claude}"
HOST_CODEX_DIR="${HOST_CODEX_DIR:-/mnt/host-codex}"
HOST_GITCONFIG="${HOST_GITCONFIG:-/mnt/host-gitconfig}"
CONTAINER_CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-/home/pwuser/.claude}"
CONTAINER_CODEX_DIR="${CODEX_HOME:-/home/pwuser/.codex}"
WORKSPACE_FOLDER="${WORKSPACE_FOLDER:-/workspace/one_portrait}"

mkdir -p "$CONTAINER_CLAUDE_DIR"
mkdir -p "$CONTAINER_CODEX_DIR"

sync_file() {
  local src="$1"
  local dest="$2"

  if [ -f "$src" ] && { [ ! -f "$dest" ] || ! cmp -s "$src" "$dest"; }; then
    cp "$src" "$dest"
    chmod 600 "$dest" || true
    echo "[devcontainer] Synced $(basename "$dest") from host."
  fi
}

sync_dir() {
  local src="$1"
  local dest="$2"
  local label="${3:-$(basename "$dest")}"

  if [ ! -d "$src" ]; then
    return 0
  fi

  mkdir -p "$dest"

  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "$src"/ "$dest"/
  else
    rm -rf "$dest"
    mkdir -p "$dest"
    cp -R "$src"/. "$dest"/
  fi

  echo "[devcontainer] Synced $label from host."
}

sync_git_identity() {
  local host_name=""
  local host_email=""
  local current_name=""
  local current_email=""

  if [ ! -f "$HOST_GITCONFIG" ]; then
    return 0
  fi

  host_name="$(git config --file "$HOST_GITCONFIG" --get user.name || true)"
  host_email="$(git config --file "$HOST_GITCONFIG" --get user.email || true)"

  current_name="$(git config --global --get user.name || true)"
  current_email="$(git config --global --get user.email || true)"

  if [ -n "$host_name" ] && [ "$host_name" != "$current_name" ]; then
    git config --global user.name "$host_name"
    echo "[devcontainer] Synced git user.name from host."
  fi

  if [ -n "$host_email" ] && [ "$host_email" != "$current_email" ]; then
    git config --global user.email "$host_email"
    echo "[devcontainer] Synced git user.email from host."
  fi

  if command -v gh >/dev/null 2>&1; then
    git config --global --replace-all credential.https://github.com.helper "!gh auth git-credential"
    git config --global --replace-all credential.https://gist.github.com.helper "!gh auth git-credential"
  fi
}

sync_codex_project_trust() {
  local config_file="$CONTAINER_CODEX_DIR/config.toml"

  if [ ! -f "$config_file" ]; then
    return 0
  fi

  if ! grep -Fq "[projects.\"$WORKSPACE_FOLDER\"]" "$config_file"; then
    {
      printf '\n'
      printf '[projects."%s"]\n' "$WORKSPACE_FOLDER"
      printf 'trust_level = "trusted"\n'
    } >> "$config_file"
    chmod 600 "$config_file" || true
    echo "[devcontainer] Added Codex trust for $WORKSPACE_FOLDER."
  fi
}

sync_file "$HOST_CLAUDE_DIR/.credentials.json" "$CONTAINER_CLAUDE_DIR/.credentials.json"
sync_file "$HOST_CLAUDE_DIR/.claude.json" "$CONTAINER_CLAUDE_DIR/.claude.json"
sync_file "$HOST_CODEX_DIR/auth.json" "$CONTAINER_CODEX_DIR/auth.json"
sync_file "$HOST_CODEX_DIR/config.toml" "$CONTAINER_CODEX_DIR/config.toml"
sync_file "$HOST_CODEX_DIR/AGENTS.md" "$CONTAINER_CODEX_DIR/AGENTS.md"
sync_file "$HOST_CODEX_DIR/installation_id" "$CONTAINER_CODEX_DIR/installation_id"
sync_file "$HOST_CODEX_DIR/ecc-install-state.json" "$CONTAINER_CODEX_DIR/ecc-install-state.json"
sync_file "$HOST_CODEX_DIR/the-security-guide.md" "$CONTAINER_CODEX_DIR/the-security-guide.md"
sync_dir "$HOST_CODEX_DIR/prompts" "$CONTAINER_CODEX_DIR/prompts" "Codex prompts"
sync_dir "$HOST_CODEX_DIR/agents" "$CONTAINER_CODEX_DIR/agents" "Codex agents"
sync_dir "$HOST_CODEX_DIR/.agents" "$CONTAINER_CODEX_DIR/.agents" "Codex .agents"
sync_dir "$HOST_CODEX_DIR/skills" "$CONTAINER_CODEX_DIR/skills" "Codex skills"
sync_dir "$HOST_CODEX_DIR/git-hooks" "$CONTAINER_CODEX_DIR/git-hooks" "Codex git hooks"
sync_dir "$HOST_CODEX_DIR/mcp-configs" "$CONTAINER_CODEX_DIR/mcp-configs" "Codex MCP configs"
sync_dir "$HOST_CODEX_DIR/scripts" "$CONTAINER_CODEX_DIR/scripts" "Codex scripts"
sync_git_identity
sync_codex_project_trust
