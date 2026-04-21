# Demo Smoke Runbook

## 目的

この runbook は、デモ前に実送信の主線を 1 回確認するための手順です。  
対象は `Google login -> photo preprocess -> Walrus PUT -> Sponsored submit_photo -> Kakera 確認` です。  
stub E2E と UI demo では代用しません。

## 起動モードの違い

| コマンド | 用途 | 外部依存 |
| :--- | :--- | :--- |
| `corepack pnpm run dev` | 通常開発 | 実 env を使う |
| `corepack pnpm run dev:demo` | UI の目視確認 | 使わない |
| `corepack pnpm run dev:e2e` | Playwright の自動テスト | すべて stub |
| `corepack pnpm run dev:smoke` | デモ前の実送信確認 | Enoki / Walrus / Sui を使う |

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

`NEXT_PUBLIC_E2E_STUB_WALLET` は空にします。  
`ADMIN_CAP_ID` と `ADMIN_SUI_PRIVATE_KEY` は、この smoke では不要です。  
Google popup を止める拡張やブラウザ設定は切っておきます。  
投稿先に使う active unit が `Pending` のまま残っていることも先に確認します。

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

## 証跡の残し方

成功時は次の 3 点を残します。

| 証跡 | 取り方 |
| :--- | :--- |
| Tx digest | waiting room の成功カード |
| Walrus `blob_id` | DevTools Network の Walrus PUT 応答 |
| Kakera 確認 | `Kakera を受け取りました。` の表示、または `/gallery` の反映、または owner の Kakera object id |

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

## 残る mock 前提

`dev:e2e` は wallet、Enoki、Walrus を stub したままです。  
`dev:demo` は UI の形だけを確認するため、実ログインや実投稿は行いません。  
この smoke で確認するのは投稿主線だけです。  
`execute` 後の回復導線や finalize の管理者操作は別 issue の範囲です。

## Pre-Demo Checklist

- `apps/web/.env.local` が real 値で埋まっている
- `NEXT_PUBLIC_E2E_STUB_WALLET` が空である
- active unit が `Pending` のまま残っている
- Google popup を止める設定が入っていない
- DevTools Network を保存できる
- 成功後に `digest`、`blob_id`、Kakera 確認の 3 点を控える

## 最新確認結果

| 日付 | unit | digest | walrus blob_id | Kakera | 備考 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 2026-04-21 | - | - | - | - | `apps/web/.env.local` が E2E stub 値のみで、real Enoki / Walrus secret が無く `dev:smoke` を起動できなかった |

このローカル環境では、`NEXT_PUBLIC_ENOKI_API_KEY`、`NEXT_PUBLIC_GOOGLE_CLIENT_ID`、`NEXT_PUBLIC_WALRUS_PUBLISHER`、`NEXT_PUBLIC_WALRUS_AGGREGATOR`、`ENOKI_PRIVATE_API_KEY` の real 値が未投入でした。  
そのため、non-stub の smoke は起動前で停止しました。  
次回は real `.env.local` を用意してから、同じ runbook を最初から実行します。
