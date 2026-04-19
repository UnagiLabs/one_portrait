<div align="center">

# ONE Portrait — The Faces of Fans

### あなたの笑顔が、ヒーローの力になる
#### *Your Smile Becomes Their Strength*

[![Hackathon](https://img.shields.io/badge/Hackathon-Sui%20x%20ONE%20Samurai%20%E2%80%94%20Apr%202026-1F8FFF?style=flat-square)](https://luma.com/suionesamurai)
[![Network](https://img.shields.io/badge/Sui-Testnet-4DA2FF?style=flat-square&logo=sui)](https://sui.io/)
[![Storage](https://img.shields.io/badge/Storage-Walrus-00C2A8?style=flat-square)](https://www.walrus.xyz/)
[![Frontend](https://img.shields.io/badge/Next.js-App%20Router-000000?style=flat-square&logo=nextdotjs)](https://nextjs.org/)
[![Hosting](https://img.shields.io/badge/Cloudflare-Workers%20%2B%20OpenNext-F38020?style=flat-square&logo=cloudflare)](https://opennext.js.org/)
[![License](https://img.shields.io/badge/License-TBD-lightgrey?style=flat-square)](#-license)

</div>

ONE Championship のファン **500人がそれぞれ1枚ずつ写真を投稿**し、**1枚の選手モザイク肖像画**を共同制作する非営利プロジェクト。完成までモザイク全体は伏せられ、500枚到達の瞬間に**全員一斉にリビール**される。各参加者には自分の担当マスを刻んだ**Soulbound NFT「欠片 (かけら / Kakera)」**が永久に届く。

> A non-profit, on-chain co-creation experience: 500 ONE Championship fans each upload one photo, and the moment the 500th lands, a single high-resolution mosaic portrait of an athlete is revealed simultaneously to everyone — and a soulbound "Kakera" NFT carrying their own tile is minted to each participant.

---

## 🎯 The Problem & The Insight / なぜ今これを作るのか

既存のファングッズや選手NFTは「**所有**」か「**投機**」に偏重しており、ファン一人ひとりの熱狂を *作品そのものとして残す* 仕組みは存在しない。ONE Portrait は、**500人のファンの日常写真を1枚の肖像画に編み込む**ことで、応援の熱量を**改ざん不可能なオンチェーン共同制作アート**として永続化する。

This project is a direct answer to the hackathon theme — **"a new way to connect ONE Championship and Japanese fans / a mechanism to close the distance between athletes and their fans"** — implemented in a way only Sui, Walrus, and Move make possible. The non-profit, soulbound design also aligns naturally with ONE Samurai's values of *respect, courage, integrity, and humility*.

- 🥋 **テーマ適合性:** ハッカソン公式テーマ「ONE Championship と日本のファンをつなぐ / アスリートとファンの距離を縮める」への直球回答。
- 🤝 **Samurai 価値観との整合:** 譲渡不可・非営利の Soulbound 設計は「リスペクト・誠実さ・謙虚さ」の体現。
- 🎁 **ファンへの還元:** 完成 Master Portrait は選手（運営）に、各 Kakera は参加ファンへ。投機ではなく**証**としてのNFT。

---

## ✨ Key Features / 主な特徴

| | Feature | 説明 |
| :---: | :--- | :--- |
| 🟦 | **摩擦ゼロ参加 / Zero-Friction Onboarding** | zkLogin (Google) + Enoki **Sponsored Transaction**。ウォレットも SUI トークンも不要。Web2 と同じUXで参加可能。 |
| 🎭 | **リビール演出 / Synchronous Reveal** | 500枚到達まで全体像は非公開。残り枚数カウンターのみで進捗を共有し、**完成の瞬間に全参加者の画面で同時にリビール**。 |
| 💎 | **Soulbound 欠片NFT / Tamper-Proof Proof-of-Participation** | Move の能力設計（`key only` / `store` 不付与）で**型レベルに譲渡を禁止**。転売不可の「ファンの証」。 |
| 🖼 | **マイギャラリー / On-Chain History** | 保有 Kakera を Sui からクエリするだけで参加履歴を完全復元。**オフチェーンDB不要**、SBT そのものが正本。 |

---

## 🎬 Demo

<!-- DEMO:TODO -->
- 🌐 **Live Demo:** `<https://TODO>` <!-- DEMO:TODO -->
- 🎥 **Walkthrough Video (3min):** `<https://TODO>` <!-- DEMO:TODO -->
- 🖼 **Screenshots:** `docs/img/01-landing.png` / `02-reveal.png` / `03-gallery.png` <!-- DEMO:TODO -->

---

## 🔄 How It Works / 体験フロー

```mermaid
flowchart LR
    A[アクセス & QR] --> B[zkLogin<br/>Google で1タップ]
    B --> C[選手選択<br/>進行中ユニット]
    C --> D[写真投稿<br/>Walrus PUT]
    D --> E[Kakera 即時受領<br/>Soulbound NFT]
    E -. 500枚到達 .-> F[一斉リビール<br/>Master Portrait]
    F --> G[マイギャラリー<br/>履歴を永続参照]
```

1. **アクセス** — 会場/SNSのQRから着地。
2. **zkLogin** — Google アカウントで認証、Sui アドレスがその場で発行。
3. **選手選択** — 参加したい選手の進行中ユニット (500マス) を選ぶ。
4. **写真投稿** — ブラウザでリサイズ+EXIF除去 → Walrus に直接 PUT。
5. **Kakera 即時受領** — `submit_photo` と同一 Tx で Soulbound NFT が自分のアドレスに mint。
6. **リビール** — 500枚目着弾 → ブラウザ分散トリガーが finalize 起動 → モザイク生成 → 全画面同時公開。
7. **マイギャラリー** — 後日アクセスすれば、保有 Kakera から参加履歴が自動復元。

---

## 🏗 Architecture / 構成

```
[ Browser  Next.js + OpenNext on Cloudflare Workers ]
        │  zkLogin → 画像前処理 → Walrus 直接 PUT
        │  submit_photo PTB (Sponsored, Kakera即時 mint)
        │  Sui WS で Submitted / UnitFilled / MosaicReady を購読
        │  UnitFilled 検知 → POST /api/finalize
        ▼
[ Sui Testnet  Move package: one_portrait ]
        ├─ Unit (shared)            進捗 / submitters / status / master_id?
        ├─ MasterPortrait           placements: Table<blob_id, Placement>
        └─ Kakera (Soulbound)       blob_id / edition / unit_id

[ Walrus ]      ファン投稿 500枚 (epochs=5) + 完成モザイク 1枚 (epochs=100)
[ Cloudflare ]  Finalize Worker ─▶ Mosaic Generator Container (on-demand)
```

詳細なコンポーネント図とシーケンス図は [`docs/tech.md` §1](docs/tech.md) を参照。

---

## ⛓ Why Sui × Walrus / 技術的ハイライト

| ハイライト | 意義 |
| :--- | :--- |
| **Walrus による100年永続** | 投稿500枚と完成モザイクを分散ストレージに保存。中央サーバー無しで長期アクセス可能に。 |
| **Sui `Table` で逆引き正本化** | `MasterPortrait.placements: Table<blob_id, Placement>` により blob_id → 配置座標を**ガス低コストでオンチェーン解決**。NFT 内部に 500件をベタ書きしないスマート設計。 |
| **Soulbound を型で保証** | Kakera は Move の能力設計 (`key only`、`store` 不付与) で**コンパイル時から譲渡不能**。実行時チェックではなく型レベルで担保。 |
| **zkLogin + Sponsored Tx** | Enoki でユーザーは Google ログインのみ。`submit_photo` は運営が Sponsored で gas 負担、`moveCallTargets` で対象を厳格に絞る。SUI 保有ゼロでフル参加。 |
| **ブラウザ分散トリガー** | `UnitFilled` 検知 → `/api/finalize` 起動を**参加者ブラウザが担う**。常駐 Listener / Cron / Queue 不要。冪等性は Move 側 (`status == Filled && master_id.is_none()`) で担保し、同時多重発火を 1件だけ成功させる。 |
| **Gas はすべて Sponsored** | ファンの全 Tx は Enoki Sponsored Transaction。`finalize` のみ AdminCap 保有運営アドレスが自己負担。 |

---

## 📦 Tech Stack

| レイヤー | 技術 |
| :--- | :--- |
| Frontend | Next.js (App Router, TypeScript) |
| Hosting | Cloudflare Workers + OpenNext (`@opennextjs/cloudflare`) |
| UI / 演出 | Tailwind CSS + shadcn/ui + Framer Motion |
| Web3 認証 | zkLogin (Sui) + Enoki |
| Sui SDK | `@mysten/sui` (PTB / イベント購読) |
| Storage | Walrus (Publisher / Aggregator HTTP API) |
| Smart Contract | Sui Move — 単一パッケージ `one_portrait` |
| Backend | Cloudflare Worker + on-demand Container (sharp / libvips) |
| Runtime | Node.js 20+ / pnpm workspace |

---

## 📚 Further Reading

- 📘 [`docs/spec.md`](docs/spec.md) — プロダクト・体験仕様（ユーザー層 / 機能要件 / フロー / Sui・Walrus 活用意義）
- 🛠 [`docs/tech.md`](docs/tech.md) — 技術仕様（アーキテクチャ / シーケンス図 / Move / Frontend / Backend / 整合性 / セキュリティ）