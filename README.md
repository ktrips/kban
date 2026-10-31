# kban

リポジトリごとのバックログに「次に作りたいこと」を書き溜め、何からやるか・どう進めるか・何を並行して進めているか・どこまで終わったかを1枚のカンバンで見ながら、GitHub Actions 上の Claude Code に実装させ、テスト → デプロイ → 確認まで進める仕組みです。Web アプリ(Firebase)と iOS アプリ(TestFlight)の両方に対応します。

## できること

- **Google でログイン**して、自分のボードと共有されたボードを開く
- **GitHub を連携**し、そのアカウントのリポジトリ(例: kfit、kmap)をボードに入れる。ボードは複数作れる
- **バックログ**にアイデアを書く。上ほど先にやる。▲▼やドラッグで並べ替え、「AIで優先順位」で順番・サイズ・理由・前提・並行可否を提案させる
- **AIで進め方を作る**: 仕様、進め方のステップ、受入条件、Claude Code への指示を Issue に書き込み、「次にやる」へ
- **AIに渡す**: Issue に `claude` ラベル。Claude Code が実装して PR を作り、あとはワークフローが テスト → デプロイ → 確認 と進める
- **並行・進捗の一覧**: ボードのトップで、全リポジトリの進行中の作業と前提待ち、リポジトリごとの完了率を表示。AI実装中は WIP 3 件まで
- **共有**: Google のメールアドレスでボードを共有(編集できる / 見るだけ)。編集者は GitHub のコラボレーターにも招待できる

## 実行と進捗

- 「次にやる」のカードで **AIに渡す** と、そのリポジトリの Issue に `claude` ラベルが付き、リポジトリ側の Claude Code(GitHub Actions)が動きます。「追加の指示」を書くと、Issue の「Claude Codeへの指示」に足されます
- カードを開くと **進捗** が見えます(実装中・テスト・デプロイ・確認で表示。実行中は15秒ごとに更新): Claude Code の実行状況(実行中/成功/失敗)、Claude Code が Issue に書く進捗メモ、PR(コミット数・差分)とチェックの結果。見るだけのメンバーにも見えます

## 自分の Claude Code との連携

ボードのリポジトリ設定 → **Claude Code 連携** で、そのリポジトリに自分の Claude Code をつなぎます(ボードの持ち主のみ)。`install.sh` を手元で実行する代わりになります。

1. **ワークフローを入れる PR を作る**: `kban-claude.yml` など、`install.sh` と同じファイルを `kban/setup-claude` ブランチに入れて PR を作ります。マージすると有効になります
2. **認証を登録**: 手元で `claude setup-token` を実行して出るトークン(Claude の契約)か、Anthropic API キーを貼ると、リポジトリの Actions Secrets に暗号化して保存します。kban には残りません
3. **Claude GitHub App** をそのリポジトリに入れる(GitHub 上の操作。リンクあり)

連携できていないリポジトリのカードには、「AIに渡す」の前に警告が出ます。ワークフローと Secrets を書くため、GitHub の連携に `workflow` 権限が要ります(以前に連携した場合は「連携し直す」)。

## Web と iPhone で同じもの

Web と iPhone アプリは同じサーバーを見ています。画像(`kban-attachments` ブランチ)、バックログ・進捗(GitHub の Issue)、ボードと共有(Firestore)は共通で、どちらから追加・更新してもすぐ反映されます(画面の更新は20秒ごと。iPhone は引っ張って更新)。別物なのは、claude.ai 上の軽量版 `board/index.html` だけです。

## 使用量の目安

「次にやる」のカードで **AIに渡す** の前に、使用量の目安と、月の予算に対する割合が出ます(例: 約40万トークン、月の予算の8%)。

- 目安は、同じサイズ(S/M/L)の完了済みカードの実績(2件以上)の中央値。なければサイズ別の既定値(S 15万 / M 50万 / L 150万)
- 実績は、リポジトリ側の `kban-claude` ワークフローが Claude Code の実行後に Issue へ記録します(`<!-- kban:tokens=… -->`。入力+出力+キャッシュ作成のトークンと概算ドル)
- 「%」の分母は、ボード設定の **月のトークン予算**。Claude の契約の残り枠(使用量メーター)は API で取れないので、自分で決めた枠に対する割合です
- ボード上部に今月の使用量、実装中のカードにここまでの使用量が出ます。既に `install.sh` を入れたリポジトリは、`install.sh` をもう一度実行して `kban-claude.yml` と `resolve.js` を更新してください

## しくみ

カード = GitHub Issue です。工程は `kban:<工程>` ラベル、順位・理由などは Issue 本文の HTML コメントに入るので、カードの中身は GitHub にあります。kban 側に保存するのは、ユーザー・GitHub の連携・ボード・共有の情報だけです(Firestore)。

```mermaid
flowchart LR
  A[バックログ<br>kban:backlog] -->|AIで進め方を作る| B[次にやる<br>kban:ready]
  B -->|AIに渡す<br>claude ラベル| C[AI実装中<br>kban:building]
  C -->|PR が開く| D[テスト<br>kban:testing]
  D -->|kban-ci 成功| E[デプロイ<br>kban:deploying]
  E -->|プレビュー /<br>TestFlight| F[確認<br>kban:verifying]
  F -->|OK / マージ| G[完了<br>Issue を閉じる]
  D -.->|AIに差し戻す<br>@claude コメント| C
  F -.->|AIに差し戻す| C
```

| 工程 | 誰が進めるか | 何が起きるか |
|---|---|---|
| バックログ → 次にやる | ボードの「AIで進め方を作る」 | Claude API が仕様・進め方・受入条件・指示・サイズ・前提を作り、Issue 本文に書く |
| 次にやる → AI実装中 | ボードの「AIに渡す」 | `claude` ラベルを付ける → `kban-claude` が Claude Code を起動 |
| → テスト | `kban-flow`(PR opened) | PR の URL を Issue に記録 |
| → デプロイ | `kban-flow`(kban-ci 成功) | Web はプレビューのデプロイ(Firebase Hosting など)、iOS は `kban-testflight` |
| → 確認 | `kban-flow`(deployment_status)/ `kban-testflight` | プレビュー URL か TestFlight のビルド番号を記録 |
| 確認 → 完了 | ボードの「OK」かマージ | Issue を閉じる |
| 差し戻し | ボードの「AIに差し戻す」 | 修正指示を PR に `@claude` 付きでコメント |

## 構成

```
kban/
├─ web/                 Next.js のボード(PWA。iPhone はホーム画面に追加)
│  ├─ auth.ts           Google ログイン(Auth.js)
│  ├─ middleware.ts     未ログインは /login へ
│  ├─ app/              画面(ui/)と API(api/)
│  └─ lib/              GitHub 連携、Issue 本文の形式、工程、AI、保存(store)、権限(access)
├─ ios/                 iPhone アプリ(Web 表示 + 共有シート)。XcodeGen の project.yml
├─ templates/           各アプリのリポジトリに入れるワークフローと CLAUDE.md
├─ scripts/install.sh   templates をアプリのリポジトリに組み込む
└─ board/index.html     claude.ai 上で動く軽量版(Issue を使わずに試せる)
```

## セットアップ

### 1. ボード(web/)を Firebase App Hosting にデプロイ(https://kban.ktrips.net)

1. Firebase コンソールでプロジェクトを作り(Blaze プランが必要)、**Firestore** をネイティブモードで作成。`.firebaserc` のプロジェクト ID は `kbanprj`
2. `firebase deploy --only firestore:rules` でルールを反映(ブラウザからの直接アクセスは全拒否。データはサーバーからだけ読み書きする)
3. Google Cloud Console で OAuth クライアント ID(ウェブ)を作り、承認済みの JavaScript 生成元に `https://kban.ktrips.net`、リダイレクト URI に `https://kban.ktrips.net/api/auth/callback/google` を登録
4. GitHub → Settings → Developer settings → **OAuth Apps** で新規作成し、callback URL に `https://kban.ktrips.net/api/github/callback` を登録
5. 秘密の値を Secret Manager に登録(名前は `web/apphosting.yaml` と同じ):
   ```bash
   for n in kban-auth-secret kban-google-id kban-google-secret kban-github-id kban-github-secret kban-anthropic-key; do
     firebase apphosting:secrets:set $n
   done
   ```
   `kban-auth-secret` は `openssl rand -base64 32` の値(後で変えると GitHub 連携が全員やり直し)。ログインを絞るなら `apphosting.yaml` の `KBAN_ALLOWED_EMAILS` を有効にする
6. `firebase apphosting:backends:create --backend kban --root-dir web` で backend を作り、`ktrips/kban` の main に GitHub 連携する(push で自動デプロイ)
7. Firebase コンソール → App Hosting → kban → 設定 → ドメインで `kban.ktrips.net` を追加し、表示された DNS レコードを `ktrips.net` に登録
8. 開いて Google でログイン → GitHub を連携 → ボードを作成 → リポジトリを追加

ローカルで動かすとき:

```bash
cd web
cp .env.example .env.local   # Firestore の設定を空にするとメモリ保存(再起動で消える)
npm install
npm run dev                  # http://localhost:3000(OAuth のリダイレクト先も localhost で登録)
```

### 2. iPhone アプリ(ios/)

画面は Web(web/)をそのまま表示します。ネイティブなのは「Google ログイン」と「共有シートからの追加」だけです。

- **共有シートから追加**: 写真・スクリーンショットの共有ボタン → **kban** → メモを書いて「追加」。追加先は前回のリポジトリが初期値です。Safari の URL やテキストも同じように送れます
- **Web の追加欄でも**: 「📷 スクリーンショット」で写真から選ぶ、貼り付け、ドラッグ&ドロップのどれでも添付できます(長辺 1600px に縮めて送信)
- 画像は、そのリポジトリの `kban-attachments` ブランチに保存され、Issue の「背景」に載ります。kban では共有メンバーにも表示されます

ビルド(Mac): `brew install xcodegen && cd ios && DEVELOPMENT_TEAM=<チームID> xcodegen && open Kban.xcodeproj`

1. Apple Developer で App Group `group.net.ktrips.kban` を作り、`net.ktrips.kban` と `net.ktrips.kban.share` の両方に付ける
2. 実機で起動 → 「Google でログイン」(ASWebAuthenticationSession。Google は WebView 内のログインを拒否するため)
3. 以後は共有シートに kban が出ます。トークンは Web の「iPhone から追加」で作り直せます(古いものは無効)

### 3. アプリのリポジトリに Claude Code 連携を入れる

```bash
bash scripts/install.sh ~/src/kfit both Kfit    # iOS+Web。最後の引数は Xcode の scheme
bash scripts/install.sh ~/src/kmap both Komap
```

対象リポジトリで:

1. 追加されたファイルをコミットして main に push
2. Claude GitHub App をインストール(ターミナルの Claude Code で `/install-github-app`)
3. Secrets に `CLAUDE_CODE_OAUTH_TOKEN`(`claude setup-token`)か `ANTHROPIC_API_KEY`
4. Web: PR ごとのプレビューのデプロイ(Firebase Hosting のプレビューチャンネルなど)を用意する。GitHub の `deployment_status` が成功になると自動で「確認」へ進む(Firebase でこのイベントが出るかは未確認)
5. iOS: TestFlight 用 Secrets を登録し、手元で一度 `fastlane match appstore`

| Secret | 用途 |
|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` / `ANTHROPIC_API_KEY` | Claude Code の実行 |
| `ASC_KEY_ID` / `ASC_ISSUER_ID` / `ASC_KEY_P8` | App Store Connect API キー |
| `MATCH_GIT_URL` / `MATCH_PASSWORD` / `MATCH_GIT_BASIC_AUTHORIZATION` | 署名証明書(fastlane match) |

## 共有について

- 共有はボード単位です。リポジトリ1つだけを共有したいときは、そのリポジトリだけのボードを作って共有します
- 共有された人がボードで Issue を動かすと、GitHub 上は**ボードの持ち主のアカウント**で操作されます。相手は GitHub の権限がなくても使えます
- 「見るだけ」の人は API 側でも書き込みが拒否されます

## 開発

```bash
cd web
npm test          # Issue 本文の形式、工程判定、保存と共有、トークン暗号化
npm run typecheck
npm run build
```

## 注意点

- `kban-ci` というワークフロー名で CI を見ています。名前を変えるときは `kban-flow.yml` と `kban-testflight.yml` も変更してください
- `anthropics/claude-code-action@v1` の入力(`label_trigger`、`claude_args` など)はアクションの更新で変わることがあります
- `AUTH_SECRET` を変えると、保存済みの GitHub トークンを復号できなくなります(全員 GitHub の連携し直し)
