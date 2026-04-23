# Finalize Generator Runbook

## 目的

この runbook は、`manji` PC 上で finalize generator スタックを運用するための手順です。
`generator:tunnel` で local generator と Cloudflare Tunnel を 1 コマンドで起動し、`/health` の local / external 確認まで自動で行います。
起動した URL は `apps/web/.cache/generator-runtime.json` に保存しつつ、Quick Tunnel のときは Cloudflare KV にも登録します。`/api/finalize`、`/api/admin/*`、admin health、`generator:smoke` は共有先として Cloudflare KV を優先し、同一マシン上の補助 fallback として local runtime state を残します。
Cloudflare Workers 側の `/api/finalize` の proof は別 runbook (`docs/demo-smoke.md`) で扱います。

`/admin` があっても、ここでの役割は health / dispatch の observability に限ります。
起動・停止は shell の SIGINT / SIGTERM で行い、process control を `/admin` に持たせません。

## 役割分担

| 場所 | 役割 |
| :--- | :--- |
| Cloudflare Worker | `UnitFilledEvent` を受けた `/api/finalize` から Worker KV 優先の runtime resolver 経由で external generator を呼ぶ |
| `manji` PC 上の `generator:tunnel` | local generator を起動し、Cloudflare Tunnel を張り、Quick Tunnel のときは current URL を Worker KV に登録する |
| Cloudflare Tunnel | `http://localhost:<port>` を外部公開する |

## 起動に必要な値

`generator:tunnel` は `apps/web/.env` と `apps/web/.env.local` を merge-load し、最後に shell env で上書きします。

### web / preview Worker 側

| 変数 | 用途 |
| :--- | :--- |
| `OP_FINALIZE_DISPATCH_SECRET` | Worker と generator で共有する secret |
| `OP_GENERATOR_RUNTIME_URL_OVERRIDE` | 任意。shell だけで使う手動 override |
| `OP_FINALIZE_DISPATCH_URL` | 任意。固定 URL を使う legacy 設定 |
| `OP_GENERATOR_BASE_URL` | 任意。固定 URL を使う legacy 設定。`OP_FINALIZE_DISPATCH_URL` と一致させる |

### `manji` PC 側

| 変数 | 用途 |
| :--- | :--- |
| `SUI_NETWORK` | `testnet` などの接続先 |
| `PACKAGE_ID` | `admin_api::finalize` を含む package |
| `WALRUS_PUBLISHER` | 完成モザイクを書き込む先 |
| `WALRUS_AGGREGATOR` | 投稿画像を読む先 |
| `ADMIN_CAP_ID` | `finalize` 実行に使う AdminCap |
| `ADMIN_SUI_PRIVATE_KEY` | `finalize` を送る管理者鍵 |
| `OP_FINALIZE_DISPATCH_SECRET` | Worker と同じ shared secret |
| `OP_LOCAL_TUNNEL_NAME` | 任意。`cloudflared tunnel run` に使う named tunnel 名。未設定なら Quick Tunnel |
| `OP_LOCAL_TUNNEL_CONFIG_PATH` | 任意。`cloudflared` の config path。省略時は `~/.cloudflared/config.yml` |
| `OP_LOCAL_GENERATOR_PORT` | 任意。local generator の port。省略時は `8080` |

`ADMIN_SUI_PRIVATE_KEY` は generator にだけ置きます。
Worker には置きません。

## 1 回だけやる準備

1. `cloudflared` を `manji` PC に入れます。
2. `cloudflared tunnel login` を実行します。
3. `cloudflared tunnel create one-portrait-generator` を実行します。
4. 公開する hostname を決めます。
5. `cloudflared tunnel route dns one-portrait-generator <hostname>` を実行します。
6. `~/.cloudflared/config.yml` か `OP_LOCAL_TUNNEL_CONFIG_PATH` で参照する config を次の形にします。

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /home/manji/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: <hostname>
    service: http://localhost:<port>
  - service: http_status:404
```

named tunnel を使う理由は、再起動しても URL を変えないためです。
Quick Tunnel は demo 前の一時確認に向きます。
`OP_LOCAL_TUNNEL_NAME` を設定した時だけ named tunnel として起動します。
`OP_LOCAL_GENERATOR_PORT` を変えるなら、named tunnel の config `service` も同じ port に合わせます。

## 起動コマンド

1. リポジトリ root で `corepack pnpm install` を実行します。
2. `apps/web/.env.local` か shell に必要な値を入れます。
3. Quick Tunnel を使うときは、URL を `.env.local` に書きません。
4. 固定 URL を手で使いたいときだけ shell で `OP_GENERATOR_RUNTIME_URL_OVERRIDE` を export します。
5. 次の 1 コマンドで stack を起動します。

```bash
corepack pnpm --filter web run generator:tunnel
```

このコマンドは次を順に行います。

- named tunnel か Quick Tunnel かの preflight
- local generator の起動
- `http://127.0.0.1:${OP_LOCAL_GENERATOR_PORT:-8080}/health` の自動確認
- Cloudflare Tunnel の起動
- 外部 URL の自動検出または named tunnel URL の確定
- `https://<hostname>/health` または `https://<random>.trycloudflare.com/health` の自動確認
- `apps/web/.cache/generator-runtime.json` の更新
- Quick Tunnel URL の Cloudflare KV 登録

local / external の `/health` は、どちらも 200 になるまで自動で再試行します。
ready になると `[generator-stack][ready]` が出ます。

## 停止方法

`generator:tunnel` を foreground で動かしている terminal で `Ctrl-C` を押します。
`SIGINT` / `SIGTERM` は generator と tunnel の両方に伝播します。

もし generator か tunnel のどちらかが先に落ちたら、wrapper が残りの child を止めて non-zero で終了します。
`/admin` は process control 用ではないので、停止は shell signal で行います。

## generator:smoke の位置づけ

`generator:smoke` は、すでに起動済みの stack に対して `/dispatch` を直接叩く補助確認です。

```bash
corepack pnpm --filter web run generator:smoke -- <Filled unit id>
```

この smoke は runtime resolver と `OP_FINALIZE_DISPATCH_SECRET` を使って `POST /dispatch` するだけです。
generator や tunnel を起動しません。
preview Worker の `/api/finalize` proof の代わりにもなりません。

`/api/finalize` の end-to-end proof が必要なときは、`docs/demo-smoke.md` の preview finalize smoke を使います。
dispatch 用の shared secret 自体を確かめたいときは、次の no-op probe を使います。

```bash
curl -H "x-op-finalize-dispatch-secret: <secret>" \
  http://127.0.0.1:8080/dispatch-auth-probe
```

この probe は secret と接続だけを確認します。
finalize 本体は実行しません。

## 値の確認ポイント

- Worker 側:
  - `OP_FINALIZE_DISPATCH_SECRET` は空でない
  - `OP_GENERATOR_RUNTIME_URL_OVERRIDE` を使うなら shell だけで入れる
  - fixed URL を使うなら `OP_FINALIZE_DISPATCH_URL` と `OP_GENERATOR_BASE_URL` を一致させる
- generator 側:
  - `ADMIN_CAP_ID` が空でない
  - `ADMIN_SUI_PRIVATE_KEY` が空でない
  - `SUI_NETWORK` と `PACKAGE_ID` が本番対象に合っている
  - `WALRUS_PUBLISHER` と `WALRUS_AGGREGATOR` が正しい
  - `OP_LOCAL_TUNNEL_NAME` が作成済み tunnel 名と一致している

## よくある失敗

| 症状 | まず見る場所 |
| :--- | :--- |
| preflight が `missing-env` で落ちる | named tunnel を使う時の `OP_LOCAL_TUNNEL_NAME`、`OP_FINALIZE_DISPATCH_URL` |
| preflight が `tunnel-misconfig` で落ちる | `OP_LOCAL_TUNNEL_CONFIG_PATH`、`OP_LOCAL_GENERATOR_PORT`、`cloudflared` の config、named tunnel の `OP_FINALIZE_DISPATCH_URL` |
| `local` `/health` が `503` を返す | generator 側の `SUI_NETWORK`、`PACKAGE_ID`、`ADMIN_CAP_ID`、`ADMIN_SUI_PRIVATE_KEY`、`WALRUS_*`、`OP_FINALIZE_DISPATCH_SECRET`、`OP_LOCAL_GENERATOR_PORT` |
| `local` `/health` は通るが `external` `/health` が通らない | `cloudflared tunnel run` のログ、DNS、`config.yml`、`OP_LOCAL_TUNNEL_NAME` |
| `/dispatch` が `401` を返す | Worker と generator の `OP_FINALIZE_DISPATCH_SECRET` |
| `/dispatch-auth-probe` が `401` を返す | web / Worker と generator の `OP_FINALIZE_DISPATCH_SECRET` |
| `/dispatch` が `500` を返す | generator 側の `ADMIN_CAP_ID`、`ADMIN_SUI_PRIVATE_KEY`、`PACKAGE_ID`、`SUI_NETWORK` |
| Worker から finalize が進まない | Cloudflare KV の current URL、`OP_GENERATOR_RUNTIME_URL_OVERRIDE`、legacy URL 設定、generator ログ |

## デモ当日の最低チェック

1. `generator:tunnel` が起動済みで、local / external health が `ok`
2. `/admin` の current URL と source が想定どおりで、Quick Tunnel 時は `worker_kv` を見ている
3. Worker と generator の `OP_FINALIZE_DISPATCH_SECRET` が一致
4. 必要なら `generator:smoke` を already-running stack で 1 回通す
5. `/api/finalize` の proof は `docs/demo-smoke.md` で別途確認する
