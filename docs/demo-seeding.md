# Demo Seeding Runbook

## 目的

この runbook は、デモ前に `submit_photo` を 1,999 件まで進めるための手順です。  
対象は `画像前処理 -> Walrus PUT -> direct submit_photo -> progress 確認` です。  
当日の最後の 1 件は、通常フロントから real submit します。

通常デモは admin で **demo unit** (`max_slots = 実際に集める残り枚数`、`display_max_slots = 2,000`) を作る方が簡便です。  
demo unit なら実送信は `max_slots` 枚 (例: 5 枚) で済み、残りタイルは generator の `OP_DEMO_FINALIZE_MANIFEST` 経由で mock 画像から埋まります。  
この runbook は **full-size unit** (`max_slots == display_max_slots == 2,000`) を real データだけで通したい場合の fallback です。  
demo unit の作成と finalize 手順は `docs/demo-smoke.md` と `docs/finalize-generator-runbook.md` にまとめています。

前提として、対象 athlete の `displayName` / `slug` / `thumbnailUrl` は
Admin UI から on-chain `Registry` に登録済みである必要があります。  
unit 作成も、その metadata 登録の後に行います。

## このツールの前提

- Sui は testnet を使います。
- Walrus も testnet を使います。
- `submit_photo` は既存の `accessors::submit_photo` をそのまま使います。
- sender は Sponsored ではありません。各 sender に testnet gas が必要です。
- unit は `Pending` のまま残っている必要があります。
- 対象 athlete の on-chain metadata が登録済みである必要があります。

## 必要なもの

| 項目 | 用途 |
| :--- | :--- |
| `unitId` | 事前投入する対象 unit |
| 画像ディレクトリ or manifest | seed 元の画像セット |
| sender config JSON | sender の秘密鍵一覧 |
| ledger path | 再開用の台帳 |
| `SUI_NETWORK=testnet` | 接続先 |
| `PACKAGE_ID` | `submit_photo` を含む package |
| `WALRUS_PUBLISHER` | Walrus PUT 先 |
| `WALRUS_AGGREGATOR` | Walrus GET 先 |

`PACKAGE_ID`、`WALRUS_PUBLISHER`、`WALRUS_AGGREGATOR` は `live` で必須です。  
`simulate` では `SUI_NETWORK` だけを必須にします。

## sender config の形

最小形は次です。

```json
{
  "senders": [
    { "label": "seed-001", "privateKey": "suiprivkey..." },
    { "label": "seed-002", "privateKey": "suiprivkey..." }
  ]
}
```

配列だけでも使えます。

```json
[
  "suiprivkey...",
  "suiprivkey..."
]
```

同じ sender から同じ unit へ再投稿はできません。  
sender 数は、投入したい残件数以上を用意します。

## 実行コマンド

package script:

```bash
corepack pnpm --filter generator seed:demo-submissions -- --mode <simulate|live> ...
```

主な引数:

| 引数 | 用途 |
| :--- | :--- |
| `--unit-id` | 対象 unit |
| `--images` | 画像ディレクトリ |
| `--manifest` | manifest JSON |
| `--sender-config` | sender config JSON |
| `--ledger` | 台帳 JSON |
| `--mode` | `simulate` または `live` |
| `--target-count` | 到達させたい件数。省略時は `max_slots - 1` |
| `--limit` | 今回処理する上限件数 |

`--images` と `--manifest` はどちらか片方を使います。

## 1. simulate

simulate の前に、Admin UI で次を済ませます。

1. athlete metadata を on-chain 登録する
2. 必要なら対象画像を使って unit を作成する
3. seeding 対象の `unitId` を控える

まずは副作用なしで、入力と sender 割当を確認します。

```bash
SUI_NETWORK=testnet \
corepack pnpm --filter generator seed:demo-submissions -- \
  --mode simulate \
  --unit-id 0xUNIT \
  --images ./seed-images \
  --sender-config ./ops/seed-senders.json \
  --ledger ./artifacts/seed-ledger.json
```

確認ポイント:

- 画像件数が足りている
- sender 数が足りている
- `targetCount` が `max_slots - 1` になっている
- `wouldUploadRows` と `wouldSubmitRows` が想定どおり

## 2. live rehearsal 10 件

次に、別 unit か staging 相当 unit で 10 件だけ実送信します。

```bash
SUI_NETWORK=testnet \
PACKAGE_ID=0xPACKAGE \
WALRUS_PUBLISHER=https://publisher.testnet.walrus.space \
WALRUS_AGGREGATOR=https://aggregator.testnet.walrus.space \
corepack pnpm --filter generator seed:demo-submissions -- \
  --mode live \
  --unit-id 0xSTAGING_UNIT \
  --images ./seed-images \
  --sender-config ./ops/seed-senders.json \
  --ledger ./artifacts/seed-rehearsal-ledger.json \
  --limit 10
```

確認ポイント:

- `processedRows` が 10
- `stoppedAfterLimit` が `true`
- ledger に `blobId`、`aggregatorUrl`、`txDigest`、`submissionNo` が残る
- ledger の `preprocessLog` に画像前処理結果が残る
- ledger の `observedSubmittedCount` と `observedUnitStatus` が進捗確認の証跡になる

## 3. 本実行

本番相当 unit に対して、最後の 1 件を残して実行します。  
`--target-count` を省略すると、現在の `max_slots - 1` を使います。

```bash
SUI_NETWORK=testnet \
PACKAGE_ID=0xPACKAGE \
WALRUS_PUBLISHER=https://publisher.testnet.walrus.space \
WALRUS_AGGREGATOR=https://aggregator.testnet.walrus.space \
corepack pnpm --filter generator seed:demo-submissions -- \
  --mode live \
  --unit-id 0xPROD_LIKE_UNIT \
  --images ./seed-images \
  --sender-config ./ops/seed-senders.json \
  --ledger ./artifacts/seed-ledger.json
```

件数を明示したい場合:

```bash
... --target-count 1999
```

## 4. resume

途中で止まった場合は、同じ `--ledger` を使って同じコマンドを再実行します。

```bash
SUI_NETWORK=testnet \
PACKAGE_ID=0xPACKAGE \
WALRUS_PUBLISHER=https://publisher.testnet.walrus.space \
WALRUS_AGGREGATOR=https://aggregator.testnet.walrus.space \
corepack pnpm --filter generator seed:demo-submissions -- \
  --mode live \
  --unit-id 0xPROD_LIKE_UNIT \
  --images ./seed-images \
  --sender-config ./ops/seed-senders.json \
  --ledger ./artifacts/seed-ledger.json
```

このときツールは:

- ledger を読み直す
- chain の `submissions` と digest 状態を突き合わせる
- 既に成功済みの sender/blob を再送しない
- 未完了分だけ続きから進める

## 5. 最終確認

本実行後は、対象 unit が次の状態になっていることを確認します。

- `submissions.length == targetCount`
- `status == pending`

確認用の例:

```bash
node --input-type=module <<'EOF'
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";

const client = new SuiClient({ url: getFullnodeUrl("testnet") });
const response = await client.getObject({
  id: process.env.UNIT_ID,
  options: { showContent: true, showType: true },
});

const fields = response.data?.content?.fields ?? {};
const submissions = Array.isArray(fields.submissions) ? fields.submissions.length : 0;
const status = fields.status;
const maxSlots = fields.max_slots;

console.log(JSON.stringify({ submissions, status, maxSlots }, null, 2));
EOF
```

`UNIT_ID` を shell で渡します。  
ここで `submissions` が `1999`、`status` が `0` なら、最後の 1 件を残せています。

## ledger で残るもの

`ledger` には少なくとも次が残ります。

- `imageKey`
- `senderAddress`
- `blobId`
- `aggregatorUrl`
- `txDigest`
- `submissionNo`
- `status`
- `preprocessLog`
- `observedSubmittedCount`
- `observedUnitStatus`
- `failureReason`

この ledger が、そのまま再開と監査の記録になります。

## 失敗時の見方

- preflight で止まる: sender 数、unit 状態、`targetCount` を見直す
- duplicate `blobId` で止まる: 同じ画像や同じ正規化結果が混ざっている
- submit で止まる: sender の gas、既存 sender 重複、digest 状態を確認する
- resume で `failed` が増える: ledger と chain の不整合を見直す

## 当日の最終順

1. `simulate` を通す
2. 別 unit で `live --limit 10` を通す
3. 本番相当 unit で full run を通す
4. `submissions.length == 1999` と `status == pending` を確認する
5. 最後の 1 件だけ通常フロントから real submit する
