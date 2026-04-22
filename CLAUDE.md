# CLAUDE.md

本ファイルは Claude Code（claude.ai/code）および Codex がこのリポジトリで作業する際の一次指示書である。

## リポジトリの状態

**1週間で完成させるハッカソン提出プロジェクト**である。審査に間に合わせることが最優先。

- **細かい点にこだわりすぎない。** 命名の揺れ、軽微なリファクタ、網羅的テスト、エッジケースの先回り対応などは後回しで良い。デモの骨格を通すことを優先する。
- **スピード優先で実装する。** 動くものを最短で立てる。既存ライブラリ / テンプレート / サンプルコードを積極的に流用し、ゼロから書くことを避ける。迷ったら素朴な実装を選ぶ。
- **重い実装箇所はモックデータで回避することを検討する。** 980枚の投稿収集、モザイク合成、Walrus への大量 PUT、zkLogin / Sponsored Tx の本番フローなど、デモ当日までに実装しきれないと判断した部分は躊躇せずモック / ダミーデータ / 事前生成結果に差し替える。実装に入る前に「本物で通すか、モックで通すか」を必ず判断し、本物にこだわって全体が止まる事態を避ける。

プレローンチ段階。現時点ではドキュメント、Devcontainer / エージェント関連のツール、設定のみが存在し、Next.js ワークスペースや Move パッケージの実装コードはまだ無い。実装を追加する際は `docs/tech.md` §3 のモノレポ構成（`apps/web/`, `contracts/`, `generator/`, `shared/`）に従うこと。

## 関連ドキュメント

- `docs/spec.md` — プロダクト / 体験仕様
- `docs/tech.md` — 技術仕様（アーキテクチャ、Move データモデル、シーケンス、制約）

これらの内容は本ファイルで重複記載しない。直接参照すること。

## プロジェクト概要

ONE Portrait は **Sui + Walrus** 上の非営利オンチェーン共同制作プロジェクト。980人のファンが zkLogin + Enoki Sponsored Transaction で写真を1枚ずつ投稿し、980枚目の着弾で選手のモザイク肖像画が同期リビールされる。参加者には Soulbound の「欠片 (Kakera)」NFT が配布される。モザイク合成はオフチェーン（Cloudflare Worker + sharp/libvips を乗せた on-demand コンテナ）で行い、完成画像は Walrus に永続化する。投稿履歴・タイル配置・Kakera mint の正本は Move パッケージ `one_portrait`。

## 不変の技術制約

以下はプロダクトモデルの前提であり、違反すると設計が崩れる:

- **ファンの Tx は全て Sponsored。** Enoki Sponsored Transaction を通し、`moveCallTargets` で `PACKAGE_ID::accessors::submit_photo` のみに限定する。ファンは SUI を保有しない。
- **Kakera は `submit_photo` と同一 Tx で mint。** `finalize` でのバッチ発行はしない。
- **Soulbound は型レベルで保証。** `Kakera` は `key` のみで `store` を付与しない。実行時の transfer チェックではなく、Move の型システムで担保する。
- **リビール前は絶対に描画しない。** `finalize` がオンチェーンで完了するまで、モザイク全体像をブラウザでレンダリングしてはならない。リビューは全クライアント同時。
- **Walrus の blob_id が正本。** オンチェーン状態はパスではなく `blob_id` で写真を参照する。`MasterPortrait.placements: Table<blob_id, Placement>` が逆引きの正本。
- **Finalize はブラウザ分散トリガー + Move 冪等。** `UnitFilledEvent` を観測したクライアントが `/api/finalize` を叩き、冪等性は Move 側の `status == Filled && master_id.is_none()` で担保する。cron / キュー / 常駐リスナーを追加してはならない。

## 作業方針

- プレローンチのため、弱い既存構造を温存するよりゼロベース再設計を優先する。移行コストは制約にしない。
- 本番にまだ存在しないデータへのバックフィル / マイグレーションスクリプトは書かない。
- 設計はシンプルに。投機的な抽象化は避ける。既存パターンへの一致より正しさを優先する。
- `.env`（将来 Next.js ワークスペース配下に置かれる想定）は絶対にコミットしない。
- `ENOKI_*` および `ADMIN_SUI_PRIVATE_KEY` は運用者専用のシークレット。`ADMIN_SUI_PRIVATE_KEY` は Cloudflare Secrets Store に隔離する。

## Move 可視性方針

Move 2024 の可視性は **最小権限を原則** とする。`public(friend)` は使わず、`fun` / `public(package)` / `public` / `entry` を次の基準で選ぶこと。

- **まず `fun` で始める。** 同一モジュール内だけで使う純ヘルパー、検証関数、ループ補助は private に閉じる。現状の `unit::validate_placements` や `unit::has_blob_id` のような関数はこの枠。
- **パッケージ内共有ロジックは `public(package)` を使う。** `events` の emit 関数、`kakera` の mint ヘルパー、`registry` の内部更新、`master_portrait` の生成処理のように、`one_portrait` パッケージ内の複数モジュールから使うが外部公開したくない関数はここに置く。
- **`public` / `entry` は公開 API モジュールに集約する。** Inuverse の `accessors.move` / `admin.move` のように、外部から触る関数は専用モジュールへ寄せる。内部実装モジュールに `public` / `entry` を分散させない。
- **`entry` は薄い入口にする。** PTB から直接叩く必要がある関数は公開 API モジュール側に置き、入口は引数受け取り、権限確認、イベント発火、返り値制約の吸収に留め、コア状態遷移は `public(package)` または private 関数へ委譲する。
- **PTB から呼びたいが外部モジュール公開は不要な場合は `public(package) entry` を検討する。** Sponsored Transaction の入口や管理者操作の薄いラッパに使える。`entry` 化してもロジック本体まで広く公開しない。
- **返り値制約で `entry` にできない場合だけ `public fun` を使う。** `Coin` など `drop` を持たない値を返す、PTB 内で他処理と合成したい、といった理由がある時は `public` を許容するが、その理由をコード上で説明できる状態にする。
- **`#[test_only]` は本番 API と分けてよい。** テスト専用 accessor や生成関数は `#[test_only] public` / `#[test_only] public(package)` を使ってよいが、本番コードから使う前提で設計しない。

このリポジトリでは、可視性を次のように整理する。

- `unit`、`registry`、`master_portrait`、`events`、`kakera` は原則として内部実装モジュールとして扱い、ここに外部向け `public` / `entry` を増やさない。
- ファン向け投稿、管理者向け生成 / finalize、off-chain 参照用 accessor などの公開関数は、専用の公開 API モジュールに集約する。責務が分かれる場合でも、公開面は少数のモジュールに限定する。
- `unit::submit_photo` のような外部入口が必要な処理も、可能なら公開 API モジュールに薄い `entry` ラッパを置き、`unit` 本体は `public(package)` で受ける構成を優先する。
- `unit::finalize`、`create_unit`、`rotate_current_unit`、`registry` 更新、`master_portrait` 生成、`events` emit、`kakera` mint は内部ロジックとして `public(package)` か private に寄せる。
- 公開 accessor も内部モジュールへ散らさず、専用 accessor モジュールに寄せる。テスト専用 accessor だけは `#[test_only]` として各モジュールに残してよい。

## 開発コマンド

コマンドはワークスペースが追加されてから存在する。未導入の時点では存在しないスクリプトを発明しない。

想定している検証順序（ルートから実行。必要に応じて `pnpm --filter <workspace>` を使う）:

```bash
pnpm run check
pnpm run typecheck
pnpm test
pnpm run build   # デプロイ / ランタイムに広く影響する変更の場合
```

Move パッケージ（`contracts/`）:

```bash
sui move build
sui move test --test
```

- 独立した `#[test_only] module ..._tests;` は `contracts/tests/` に置く。`contracts/sources/` には本番モジュールと `#[test_only]` helper だけを残す
- `sui move test --list --test` で `contracts/tests/` 配下の列挙も確認できる

## Devcontainer

標準の入口は Dev Container 対応ツール（VS Code / Cursor 等）または `scripts/dev-container.sh`（`@devcontainers/cli` が無ければ `npx --yes @devcontainers/cli@latest` にフォールバック）。

- コンテナ内の作業ディレクトリ: `/workspace/one_portrait`。
- ホスト側ポートは Docker が **動的に割当**（コンテナ内は `3000` / `9323` で固定）。他プロジェクトの devcontainer と同時起動してもポートが衝突しない。URL は起動直後に `scripts/dev-container.sh` が表示する。後から確認する場合:
  ```bash
  docker compose -p one_portrait port dev 3000   # Next.js
  docker compose -p one_portrait port dev 9323   # Playwright レポート
  ```
- 隔離境界: `cap_drop: [ALL]` + `no-new-privileges:true`。この境界を前提に、コンテナ内では Codex が `approval_policy = "never"` / `sandbox_mode = "danger-full-access"`、Claude Code が `Bash(*)` / `WebFetch` / `WebSearch` を allow している。境界を崩さない限りこの設定は妥当。
- `.devcontainer/post-start.sh` が read-only bind したホスト認証情報（`~/.claude/.credentials.json`, `~/.claude/.claude.json`, `~/.codex/auth.json`, `~/.codex/config.toml`, `~/.codex/installation_id`, `~/.gitconfig` の `user.name` / `user.email`, `gh` credential helper）をコンテナ内 named volume へ片方向同期する。`docker compose up` 単体はこの初期化を経由しないため正式サポート外。

## リポジトリ内エージェント資源

タスクが該当する場合は自前フローを組まずこちらを優先する:

- `.agents/skills/gh-issue-implement` — Issue のエンドツーエンド実行（Codex で計画・実装・レビュー・PR 作成まで完結）。
- `.agents/skills/prepare-pr` — PR タイトル / 本文規約（日本語）。
- `.agents/skills/cleanup-gone-branches` — upstream が消えたローカルブランチの安全削除。
- `.agents/skills/claude-consult` — ローカル `claude` CLI 経由の読み取り専用セカンドオピニオン。
- `.agents/skills/draft-commit-message` — 現在の diff から日本語コミットメッセージ草稿を生成。
- `.codex/hooks/` — PostToolUse `post-edit-check.sh`, Stop `stop-quality-gate.sh`。最寄りの `package.json` を自動検出するため、Node ワークスペースが無いうちは何もしない。
- `.codex/agents/` — `issue-planner`, `issue-step-worker`, `verification-reviewer`。
