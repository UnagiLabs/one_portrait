# ONE Portrait Speaker Notes

## 01 Title

Hello everyone. Let me introduce ONE Portrait. Our tagline: Your smile is their strength. Two thousand fans of ONE Championship — each brings one photo — together we paint one portrait of an athlete. Fully on-chain, fully non-profit.

ハロー、皆さん。ONE Portrait を紹介させてください。キャッチは『あなたの笑顔が、ヒーローの力になる』。ファン2,000人が1枚ずつ写真を持ち寄り、選手の肖像画を共同制作します。完全オンチェーン、非営利です。

## 02 Problem

Most Web3 today is about owning and trading. But fans want something else. They want to send their support to the fighter, share the moment with the room, and keep that night forever. ONE Portrait does all three at once. Two thousand photos become a visible wall of support. The reveal turns the venue into one room. And Kakera — a Soulbound NFT — is the proof. Not ownership. Not speculation. A gift, both ways.

今のWeb3の多くは所有や投機に偏っています。でもファンが望むのは違います。応援を選手に届けたい、その瞬間を会場で共有したい、後にあの夜を残したい。ONE Portrait はこの三つを同時に叶えます。2,000枚の写真は可視化された応援になり、リビールは会場を一つにし、KakeraというSoulbound NFTがあの夜の証になる。所有でも投機でもなく、双方向の贈り物です。

## 03 Solution

The idea is simple. Two thousand fans, one photo each, one portrait of an athlete. The mosaic stays hidden until photo number 2,000 arrives. Then it reveals on every screen at once.

アイデアはシンプル。2,000人のファンが1枚ずつ写真を投稿し、選手のモザイク肖像画を共同制作する。完成までモザイクは伏せられ、2,000枚目で全員の画面に同時にリビールされます。

## 04 Theme Fit

The hackathon brief was: build a new way to connect ONE Championship with Japanese fans. There are many valid Web3 answers — tokens, points, limited drops. They all work. But we picked a different axis. We didn't want fans here for speculation, points farming, or a collectible drop. We wanted them here to belong — to be able to say, 'I was there that night.' So our answer is literal. The fans' photos become the portrait. And it lines up with ONE's own values — respect, integrity, humility.

ハッカソンのテーマは『ONE Championshipと日本のファンをつなぐ新しい方法』。Web3の答えはいくつもあります ── トークン、ポイ活、コレクタブル販売、どれも成立する。でも私たちは別軸を選びました。投機でも、ポイ活でも、コレクタブル目当てでもなく、『あの夜に立ち会った』と言える、そういう繋がり方を作りたかった。だから答えは文字どおり、ファンの写真がそのままヒーローの肖像になる。これはONE自身の価値観 ── リスペクト、誠実さ、謙虚さ ── にも自然に重なります。

## 05 Flow

Here is the flow. Scan the QR at the venue. Sign in with Google — that's zkLogin, no wallet, no SUI token. Pick an athlete. Upload a photo. In the same transaction, you receive a Soulbound NFT called Kakera. The UX feels like Web2. The backend is fully on-chain.

体験の流れです。会場のQRから着地、Googleでワンタップログイン ── zkLoginなのでウォレットもSUIトークンも不要。選手を選んで写真を投稿すると、同じトランザクションで Soulbound NFT『Kakera』を受け取ります。Web2と同じUX、裏側は完全にオンチェーンです。

## 06 Reveal

This is the highlight. While in progress, you only see a counter. The 2,000th photo becomes a distributed trigger. Every browser finalizes the mosaic at the same time. The portrait rises on every screen at once. It's a festival moment.

ここが見せ場です。進捗中はカウンターしか見えません。2,000枚目の到着が分散トリガーとなり、全員のブラウザが同時にモザイクを finalize、完成作品が一斉に立ち上がります。祭のような瞬間です。

## 07 Kakera

Kakera. It means 'fragment' in Japanese. This is what every fan receives — proof that you were there that night. If you hold a Kakera, the app shows you exactly where your photo sits in the mosaic, with coordinates. 'I'm right there, in that portrait.' It's not a collectible to flip — it's a receipt of presence, and a receipt you can find. Technically, it's a Soulbound NFT — untradeable by design, so the meaning never gets diluted by the secondary market.

Kakera ── 日本語で『欠片』という意味です。これが、参加してくれたファン全員に渡る『あの夜に立ち会った証』。Kakeraを保有していると、自分の写真が完成モザイクのどこに使われているか座標とともに表示されます。『あの肖像の、あの位置に、私がいる』。転売目的のコレクタブルではなく、見つけられる証です。技術的にはSoulbound NFT ── 譲渡不能な設計なので、二次市場で意味が薄まることがありません。

## 08 Why Sui x Walrus

Why Sui and Walrus. Four reasons. One: Walrus stores the mosaic permanently. Two: Sui Table reverse-lookups blob ID to coordinates cheaply on-chain. Three: Move's ability system enforces Soulbound at the type level. Four: zkLogin plus Enoki's sponsored transactions mean zero gas for fans. Only this stack works.

なぜ Sui と Walrus か。4点あります。1.Walrusで完成モザイクを永続保存。2.SuiのTableでblob_idから座標を低コストにオンチェーン解決。3.Moveの能力設計でSoulboundを型保証。4.zkLoginとEnokiのSponsored Transactionでガス負担ゼロ。この組み合わせでしか成立しません。

## 09 Demo

That's the design. Now let me show you the live demo. From landing to upload, reveal, and your gallery — all running on Sui Testnet.

ここまでが設計の話。ここからは実際に動いているデモを。Sui Testnet 上でランディング、投稿、リビール、マイギャラリーまで通しでご覧いただけます。

## 10 Where It Shines

### Japanese

ONE Portrait は、ひとつのシンプルな機能です。

でも、使える場面はひとつではありません。

試合当日、ファンミーティング、会場演出、ツアーの記録。

どの場面でも、ファンは一枚の写真で参加できます。

その写真が、選手への応援として見える形になります。

ONEのアスリートとファンの距離を、少し近づける。

それが、このプロダクトの一番大事な価値です。

### English

ONE Portrait is one simple feature.

But it can work in many scenes.

Match day, fan meetings, stadium shows, and tour memories.

In every scene, a fan joins with just one photo.

That photo becomes visible support for the athlete.

So ONE athletes and fans feel closer.

That is the most important value of this product.

## 11 Tomorrow

And one more thing. You can use this tomorrow. At ONE SAMURAI, in the lobby before the match, just put up a QR code and say 'Join us.' That's it. No special venue setup. No staff operation. No pre-registration. Just a phone and one QR code. That's what makes this design strong.

そしてもう一つ。これ、明日からでも使えます。明日のONE SAMURAI、試合前のロビーで『QR、ここにあります、参加してください』と言うだけ。会場側の特別な設備も、運営オペレーションも、事前申込も不要。スマホとQRコード一枚あれば動き出すサイドイベントになる。これがこの設計の一番強いところです。

## 12 Close

Our team is two people. BUTASAN, engineering lead. SHIZUKU, concept and UI/UX engineer. One last time — your smile is their strength. Thank you.

チームは二人。メインエンジニアの BUTASAN と、コンセプト・UI/UXエンジニアの SHIZUKU です。最後にもう一度 ── あなたの笑顔が、ヒーローの力になる。ありがとうございました。
