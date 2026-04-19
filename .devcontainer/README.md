# Dev Container

標準の開発入口は [devcontainer.json](./devcontainer.json) です。

## 前提

- ホストに `~/.claude` がある
- ホストに `~/.codex` がある
- ホストに `~/.gitconfig` がある
- ホストに `~/.config/gh` がある

## 起動

1. Dev Container 対応ツール（VS Code / Cursor 等）でこのリポジトリを開く
2. コンテナが起動したら `/workspace/one_portrait` で作業できる
3. 将来 Next.js パッケージが追加されたら、そのディレクトリで `npm install` / `npm run dev` を実行する

CLI から起動したい場合は `scripts/dev-container.sh` を実行してください。`@devcontainers/cli` 経由で同じ devcontainer.json を解釈し、`devcontainer up` 後に `/workspace/one_portrait` で bash へ入ります（`devcontainer` 未導入時は `npx --yes @devcontainers/cli@latest` にフォールバック）。

ホスト側ポートは Docker が空き番号を自動で割り当てます（コンテナ内は従来どおり `3000` / `9323`）。これにより他プロジェクトの devcontainer と同時起動してもポートが衝突しません。ブラウザから開くときの URL は `scripts/dev-container.sh` が起動直後に表示します。後から確認したい場合は以下で取得できます。

```bash
docker compose -p one_portrait port dev 3000   # Next.js
docker compose -p one_portrait port dev 9323   # Playwright レポート
```

コンテナ内で Codex / Claude Code を使う場合は、このシェルで `pwd` が `/workspace/one_portrait` になっていることを確認してから `codex` または `claude` を起動してください。この経路で起動したエージェントは bind mount されたプロジェクトを編集するため、変更はホスト側のリポジトリでも `git status` / `git diff` にそのまま現れます。

## 初期化

起動後に [post-start.sh](./post-start.sh) が実行され、次だけを同期します。

- `~/.claude/.credentials.json`
- `~/.claude/.claude.json`
- `~/.codex/auth.json`
- `~/.codex/config.toml`
- `~/.codex/installation_id`
- `~/.gitconfig` の `user.name` / `user.email`
- GitHub credential helper を `gh auth git-credential` に設定
- Codex の trusted project に `/workspace/one_portrait` を追加

Dockerfile では `@openai/codex` と `@anthropic-ai/claude-code`（公式インストーラ経由）もインストール済みです。

`docker compose up` 単体は正式サポート外です。Git / Claude / Codex の初期化は保証しません。

## 隔離境界

隔離境界は Docker が担います。

- `cap_drop: [ALL]` で Linux capability を全剥奪
- `security_opt: no-new-privileges:true` で特権昇格を禁止
- ホストの `~/.claude` `~/.codex` `~/.gitconfig` `~/.config/gh` は read-only bind で読み取り、必要ファイルのみコンテナ内 named volume にコピー

この境界の内側では、Codex の `approval_policy = "never"` / `sandbox_mode = "danger-full-access"` と Claude Code の `permissions.allow` 宣言により、エージェントは承認プロンプトに止められずフルアクセスで動作します。
