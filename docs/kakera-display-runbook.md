# Kakera Display 運用手順

この手順は現在のデプロイで新規 mint される `Kakera` の Display だけを対象にする。旧 package `0x8568...ffbf` で mint 済みの object は対象外。

## 前提

- `image_url` と `thumbnail_url` は固定で `https://github.com/UnagiLabs/one_portrait/blob/main/apps/web/src/app/icon.jpg?raw=true` を使う。
- `name`、`description`、`project_url` は package の `registry.move` で定義した値を維持する。
- Display 更新には Display object の owner 権限を持つ運用アドレスを使う。

## Display object の確認

1. `ops/deployments/testnet.json` で `originalPackageId` を確認する。
2. Sui Explorer で package の objects を開き、型が `0x2::display::Display<ORIGINAL_PACKAGE_ID::kakera::Kakera>` の object を探す。
3. CLI で確認する場合は Display object ID を指定して取得する。

```bash
sui client object <DISPLAY_OBJECT_ID> --json
```

`fields` に `name`、`description`、`image_url`、`thumbnail_url`、`project_url` があり、`version` が更新済みであることを確認する。

## Kakera 表示の検証

mint 済みの現在デプロイの Kakera object ID に対して、JSON-RPC の `sui_getObject` で `showDisplay: true` を指定する。

```bash
curl -s -X POST "$SUI_RPC_URL" \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "sui_getObject",
    "params": [
      "<KAKERA_OBJECT_ID>",
      {
        "showType": true,
        "showContent": true,
        "showDisplay": true
      }
    ]
  }'
```

レスポンスの `data.display.data.image_url` と `data.display.data.thumbnail_url` が固定 URL になっていることを確認する。Explorer でも同じ Kakera object を開き、画像が表示されることを確認する。

## 公開済み current-package Display の更新

すでに公開済みの現在デプロイの Display object を更新する場合は、運用アドレスで Programmable Transaction Block を作る。同じ Display object に対して、既存 field は `sui::display::edit` で更新し、足りない field は `sui::display::add` で追加する。最後に `sui::display::update_version` を呼ぶ。

`packageId` は `submit_photo` などの関数呼び出しに使う。`Kakera` や `Display<Kakera>` の型名には `originalPackageId` を使う。Sui の package upgrade 後も、既存 struct の型名は original package に紐づくため。

更新する field:

- `image_url` は `sui::display::edit` で更新する。
- `thumbnail_url` は存在しなければ `sui::display::add` で追加する。
- どちらの値も `https://github.com/UnagiLabs/one_portrait/blob/main/apps/web/src/app/icon.jpg?raw=true` にする。

`name`、`description`、`project_url` は変更しない。PTB 実行後、Display object の `version` が増えていることを確認し、上記の `sui_getObject` + `showDisplay: true` で current-package Kakera の表示を再検証する。
