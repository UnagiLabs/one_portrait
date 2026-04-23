# Demo Smoke Runbook

## 目的

この runbook は、デモ前に実送信と finalize の主線を確認するための手順です。  
対象は `Google login -> photo preprocess -> Walrus PUT -> Sponsored submit_photo -> Kakera 確認` と、  
`preview Worker -> external generator -> finalize` です。  
stub E2E と UI demo では代用しません。

## 起動モードの違い

| コマンド | 用途 | 外部依存 |
| :--- | :--- | :--- |
| `corepack pnpm run dev` | 通常開発 | 実 env を使う |
| `corepack pnpm run dev:demo` | UI の目視確認 | 使わない |
| `corepack pnpm run dev:e2e` | Playwright の自動テスト | すべて stub |
| `corepack pnpm run test:e2e:readiness` | デモ前の自動回帰確認 | すべて stub |
| `corepack pnpm run dev:smoke` | デモ前の実送信確認 | Enoki / Walrus / Sui を使う |
| `corepack pnpm --filter web preview` | preview Worker の finalize 確認 | Sui / Walrus / generator / Tunnel を使う |

## 完成判定の分担

この issue では、自動 lane と手動 lane を分けます。  
`#22` の実送信確認は **manual-only** です。  
`test:e2e:readiness` が通っても、`dev:smoke` は代替しません。
`generator:smoke` は already-running stack に対する補助の `/dispatch` 確認で、下の preview Worker の `/api/finalize` proof には使いません。

| レーン | コマンド | 何を保証するか | 含まないもの |
| :--- | :--- | :--- | :--- |
| 自動 lane | `corepack pnpm run test:e2e:readiness` | `#23` の gallery 導線、`#24` の gallery connect CTA、`#25` の degraded UX を stub E2E でまとめて確認する | real Google login、real Walrus PUT、real Sponsored submit、real Kakera 確認、real finalize |
| 手動 lane A | `corepack pnpm run dev:smoke` | `#22` の実送信主線を real env で 1 回通し、証跡 3 点を残す | preview Worker、external generator、finalize |
| 手動 lane B | `corepack pnpm --filter web preview` | preview Worker から external generator `/dispatch` を呼び、finalize の証跡を残す | UI 文言の広い回帰、stub E2E の代替 |

## 必要な準備

`apps/web/.env.local` を `apps/web/.env.example` から作ります。  
最低限必要なのは次です。

| 変数 | 用途 |
| :--- | :--- |
| `NEXT_PUBLIC_SUI_NETWORK` | 接続先の Sui network |
| `NEXT_PUBLIC_PACKAGE_ID` | `submit_photo` を含む package |
| `NEXT_PUBLIC_REGISTRY_OBJECT_ID` | home から active unit を引く registry |
| `NEXT_PUBLIC_ENOKI_API_KEY` | Enoki の公開キー |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google login 用 client id |
| `NEXT_PUBLIC_WALRUS_PUBLISHER` | Walrus PUT 先 |
| `NEXT_PUBLIC_WALRUS_AGGREGATOR` | Walrus GET 先 |
| `ENOKI_PRIVATE_API_KEY` | sponsor / execute API 用の秘密キー |
| `OP_FINALIZE_DISPATCH_URL` | preview Worker が external generator を呼ぶ先 |
| `OP_FINALIZE_DISPATCH_SECRET` | preview Worker と generator で共有する secret |
| `ADMIN_CAP_ID` | finalize 用の AdminCap |
| `ADMIN_SUI_PRIVATE_KEY` | finalize を送る管理者鍵 |
| `OP_LOCAL_TUNNEL_NAME` | `generator:tunnel` の named tunnel 名 |
| `OP_LOCAL_TUNNEL_CONFIG_PATH` | 任意。`generator:tunnel` で使う `cloudflared` config path |
| `OP_LOCAL_GENERATOR_PORT` | 任意。`generator:tunnel` で使う local generator port |

`NEXT_PUBLIC_E2E_STUB_WALLET` は空にします。  
Google popup を止める拡張やブラウザ設定は切っておきます。  
投稿先に使う active unit が `Pending` のまま残っていることも先に確認します。
finalize を試すときは、別途 `Filled` の unit id も必要です。

## 実行手順

1. `corepack pnpm install` を実行します。
2. `corepack pnpm run dev:smoke` を起動します。
3. home から active な athlete card を開きます。
4. ブラウザの DevTools を開き、Network を残します。
5. waiting room で Google login を行います。
6. 投稿に使う写真を選び、同意を入れて送信します。
7. 成功したら画面の `digest` と `送信アドレス` を控えます。
8. Network の Walrus `PUT /v1/blobs?epochs=5` 応答から `blobId` を控えます。
9. waiting room の成功カードで `Kakera を受け取りました。` が出るか確認します。
10. 追加の証跡が必要なら `/gallery` を開き、反映済み entry を確認します。

## preview finalize smoke の実行手順

1. `corepack pnpm --filter web run generator:tunnel` を起動します。
2. `generator:tunnel` が local / external `/health` を自動確認して ready になるまで待ちます。
3. preview Worker 側の `OP_FINALIZE_DISPATCH_URL` を `https://<hostname>` にそろえます。
4. preview Worker 側の `OP_FINALIZE_DISPATCH_SECRET` を generator と同じ値にそろえます。
5. `corepack pnpm --filter web preview` を起動します。
6. `Filled` の unit id で preview Worker の `/api/finalize` に POST します。
7. preview Worker の応答を控えます。
8. generator 側で `/dispatch` 到達ログを確認します。
9. 成功したら `digest` と完成モザイクの `blob_id` を控えます。

## 証跡の残し方

成功時は submit と finalize で別々に証跡を残します。

### submit smoke の証跡

| 証跡 | 取り方 |
| :--- | :--- |
| Tx digest | waiting room の成功カード |
| Walrus `blob_id` | DevTools Network の Walrus PUT 応答 |
| Kakera 確認 | `Kakera を受け取りました。` の表示、または `/gallery` の反映、または owner の Kakera object id |

### preview finalize の証跡

| 証跡 | 取り方 |
| :--- | :--- |
| preview Worker 応答 | `/api/finalize` のレスポンス |
| generator `/dispatch` 到達 | generator 側ログ |
| finalize 完了 | `digest` と完成モザイクの `blob_id` |

Kakera object id まで欲しい場合は、成功カードの `送信アドレス` と `.env.local` の `NEXT_PUBLIC_PACKAGE_ID` を使って Sui RPC を引きます。  
例:

```bash
node --input-type=module <<'EOF'
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";

const client = new SuiClient({ url: getFullnodeUrl(process.env.NETWORK) });
const response = await client.getOwnedObjects({
  owner: process.env.OWNER,
  filter: { StructType: `${process.env.PACKAGE_ID}::kakera::Kakera` },
  options: { showContent: true, showType: true },
});

console.log(JSON.stringify(response.data, null, 2));
EOF
```

このコマンドでは `NETWORK`、`OWNER`、`PACKAGE_ID` を shell で渡します。  
`walrus_blob_id` が今回の `blob_id` と一致する object を記録対象にします。

## 失敗時の見方

`Walrus への写真の保存に失敗しました` が出たら、まず `NEXT_PUBLIC_WALRUS_PUBLISHER` と `NEXT_PUBLIC_WALRUS_AGGREGATOR` を見直します。  
Google login 直後に戻る場合は、`NEXT_PUBLIC_GOOGLE_CLIENT_ID` と Enoki の設定を見直します。  
digest が出たのに Kakera が見えない場合は、fullnode 反映待ちの可能性があります。  
30 秒ほど待っても見えなければ、その時点を失敗として記録します。
preview finalize で `/dispatch` が `401` の場合は `OP_FINALIZE_DISPATCH_SECRET` を見直します。  
preview finalize で `/dispatch` が `500` の場合は generator 側の `ADMIN_CAP_ID`、`ADMIN_SUI_PRIVATE_KEY`、`PACKAGE_ID`、`SUI_NETWORK` を見直します。

## 残る mock 前提

`dev:e2e` は wallet、Enoki、Walrus を stub したままです。  
`dev:demo` は UI の形だけを確認するため、実ログインや実投稿は行いません。  
この smoke で確認するのは投稿主線と preview finalize です。  
`generator:smoke` はこの proof の代わりではなく、generator stack そのものの補助確認です。  
本番 deploy 後の最終運用確認は別レーンで扱います。

## Pre-Demo Checklist

- `apps/web/.env.local` が real 値で埋まっている
- `NEXT_PUBLIC_E2E_STUB_WALLET` が空である
- active unit が `Pending` のまま残っている
- finalize 用に `Filled` の unit id を控えている
- Google popup を止める設定が入っていない
- DevTools Network を保存できる
- 成功後に `digest`、`blob_id`、Kakera 確認の 3 点を控える
- preview Worker の URL と generator hostname を控えている
- Worker と generator の `OP_FINALIZE_DISPATCH_SECRET` が一致している

## デモ前の最終確認順

1. `corepack pnpm run test:e2e:readiness` を実行します。
2. `#23` `#24` `#25` の回帰が自動で通ることを確認します。
3. real `.env.local` を入れた状態で `corepack pnpm run dev:smoke` を起動します。
4. `Google login -> Walrus PUT -> Sponsored submit -> Kakera 確認` を 1 回通します。
5. `digest`、`blob_id`、Kakera 確認の 3 点を記録します。
6. `corepack pnpm --filter web run generator:tunnel` を起動し、local / external `/health` が ready になるまで待ちます。
7. 必要なら `corepack pnpm --filter web run generator:smoke -- <Filled unit id>` を補助確認として 1 回通します。
8. `corepack pnpm --filter web preview` で preview Worker を立ち上げます。
9. `/api/finalize` を 1 回通し、preview Worker 応答と generator ログを記録します。
10. `digest` と完成モザイク `blob_id` を記録します。
11. 失敗した場合は、この runbook の「最新確認結果」に到達地点を書きます。

## 最新確認結果

| 日付 | unit | digest | walrus blob_id | Kakera | 備考 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 2026-04-21 | `0x40df8e7c5bab39e767f64b7f5ffbbabb9e103a9df4db7872d9978eb60d4e31de` | `BjR9LrngScQrBjqD8Upx2hfC1DRL8UPJB4ezp9WRiL5s` | `vaN8VlgqAMq0mcQtkgMPqnz3KnjjDftog28tVJF8AFE` | `0x1884569ea7b990035635768d05bab0b12c1d1e5ca5dd58d56b096a4aaae08693` | `submission_no #1`, 送信アドレス `0x9c5273fb25c4f4ebf26914281499b763d300b789f53792935b10d67bf3d4daa4`, waiting room で `Kakera を受け取りました。` を確認 |
| 2026-04-21 | - | - | - | - | `apps/web/.env.local` が E2E stub 値のみで、real Enoki / Walrus secret が無く `dev:smoke` を起動できなかった |

## 最新確認結果: preview finalize

| 日付 | preview Worker | unit | digest | mosaic blob_id | 備考 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 2026-04-22 | 未実行 | - | - | - | このローカル環境では `NEXT_PUBLIC_*`、`ENOKI_PRIVATE_API_KEY`、`ADMIN_CAP_ID`、`ADMIN_SUI_PRIVATE_KEY`、`OP_FINALIZE_DISPATCH_URL`、`OP_FINALIZE_DISPATCH_SECRET` が未投入で、preview finalize smoke の前提を満たせなかった |

このローカル環境では、`NEXT_PUBLIC_ENOKI_API_KEY`、`NEXT_PUBLIC_GOOGLE_CLIENT_ID`、`NEXT_PUBLIC_WALRUS_PUBLISHER`、`NEXT_PUBLIC_WALRUS_AGGREGATOR`、`ENOKI_PRIVATE_API_KEY` の real 値が未投入でした。  
そのため、non-stub の smoke は起動前で停止しました。  
次回は real `.env.local` を用意してから、同じ runbook を最初から実行します。
