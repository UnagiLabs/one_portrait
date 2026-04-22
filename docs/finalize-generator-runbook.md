# Finalize Generator Runbook

## 目的

この runbook は、`manji` PC 上で finalize generator を動かし続けるための手順です。
Cloudflare Workers 側の `/api/finalize` は、この generator の `/dispatch` を呼びます。
ハッカソン期間中は、この runbook を運用の正本にします。

## 役割分担

| 場所 | 役割 |
| :--- | :--- |
| Cloudflare Worker | `UnitFilledEvent` を受けた `/api/finalize` から external generator を呼ぶ |
| `manji` PC | `sharp` を使ってモザイクを生成し、Walrus PUT と `finalize` Tx を送る |
| Cloudflare Tunnel | `http://localhost:8080` を外部公開する |

## 必要な値

### Worker 側

| 変数 | 用途 |
| :--- | :--- |
| `OP_FINALIZE_DISPATCH_URL` | generator の外部 URL。例: `https://generator.oneportrait.example` |
| `OP_FINALIZE_DISPATCH_SECRET` | Worker と generator で共有する secret |

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
| `PORT` | 省略時は `8080` |

`ADMIN_SUI_PRIVATE_KEY` は generator にだけ置きます。
Worker には置きません。

## 1 回だけやる準備

1. `cloudflared` を `manji` PC に入れます。
2. `cloudflared tunnel login` を実行します。
3. `cloudflared tunnel create one-portrait-generator` を実行します。
4. 公開する hostname を決めます。
5. `cloudflared tunnel route dns one-portrait-generator <hostname>` を実行します。
6. `~/.cloudflared/config.yml` を次の形で作ります。

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /home/manji/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: <hostname>
    service: http://localhost:8080
  - service: http_status:404
```

named tunnel を使う理由は、再起動しても URL を変えないためです。
毎回 URL が変わる運用は、この issue では取りません。

## 通常の起動順

1. リポジトリ root で `corepack pnpm install` を実行します。
2. `apps/web/.env.local` か shell に必要な値を入れます。
3. generator を起動します。

```bash
corepack pnpm --filter web run generator
```

`apps/web/scripts/run-local-generator.mjs` は次を引き継ぎます。

- `SUI_NETWORK`
- `PACKAGE_ID`
- `WALRUS_PUBLISHER`
- `WALRUS_AGGREGATOR`
- `ADMIN_CAP_ID`
- `ADMIN_SUI_PRIVATE_KEY`
- `OP_FINALIZE_DISPATCH_SECRET`

4. 別ターミナルで local health を確認します。

```bash
curl http://127.0.0.1:8080/health
```

5. Tunnel を起動します。

```bash
cloudflared tunnel run one-portrait-generator
```

6. 外部 health を確認します。

```bash
curl https://<hostname>/health
```

7. Worker 側の `OP_FINALIZE_DISPATCH_URL` を `https://<hostname>` にそろえます。
8. Worker 側の `OP_FINALIZE_DISPATCH_SECRET` を generator と同じ値にそろえます。

## 再起動後の復旧順

1. `manji` PC を起動します。
2. リポジトリで `corepack pnpm install` が必要か確認します。
3. generator を起動します。
4. `curl http://127.0.0.1:8080/health` で local health を確認します。
5. Tunnel を起動します。
6. `curl https://<hostname>/health` で外部 health を確認します。
7. Worker 側の `OP_FINALIZE_DISPATCH_URL` が同じ hostname のままか確認します。
8. Worker 側の `OP_FINALIZE_DISPATCH_SECRET` が generator と同じか確認します。
9. preview Worker の finalize smoke を 1 回流します。

## 値の確認ポイント

- Worker 側:
  - `OP_FINALIZE_DISPATCH_URL` は `https://` で始まる
  - `OP_FINALIZE_DISPATCH_SECRET` は空でない
- generator 側:
  - `ADMIN_CAP_ID` が空でない
  - `ADMIN_SUI_PRIVATE_KEY` が空でない
  - `SUI_NETWORK` と `PACKAGE_ID` が本番対象に合っている
  - `WALRUS_PUBLISHER` と `WALRUS_AGGREGATOR` が正しい

## よくある失敗

| 症状 | まず見る場所 |
| :--- | :--- |
| `/health` は local で通るが外部で通らない | `cloudflared tunnel run` のログ、DNS、`config.yml` |
| `/dispatch` が `401` を返す | Worker と generator の `OP_FINALIZE_DISPATCH_SECRET` |
| `/dispatch` が `500` を返す | generator 側の `ADMIN_CAP_ID`、`ADMIN_SUI_PRIVATE_KEY`、`PACKAGE_ID`、`SUI_NETWORK` |
| Worker から finalize が進まない | `OP_FINALIZE_DISPATCH_URL`、preview Worker 設定、generator ログ |

## デモ当日の最低チェック

1. local health が `ok`
2. 外部 health が `ok`
3. Worker 側 URL が named tunnel の hostname
4. Worker と generator の secret が一致
5. preview Worker で finalize smoke を 1 回通す
