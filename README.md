# kban

リポジトリごとのバックログに「次に作りたいこと」を書き溜め、何からやるか・どう進めるか・何を並行して進めているか・どこまで終わったかを1枚のカンバンで見ながら、GitHub Actions 上の Claude Code に実装させ、テスト → デプロイ → 確認まで進める仕組みです。Web アプリ(Vercel)と iOS アプリ(TestFlight)の両方に対応します。

## できること

- **Google でログイン**して、自分のボードと共有されたボードを開く
- **GitHub を連携**し、そのアカウントのリポジトリ(例: kfit、kmap)をボードに入れる。ボードは複数作れる
- **バックログ**にアイデアを書く。上ほど先にやる。▲▼やドラッグで並べ替え、「AIで優先順位」で順番・サイズ・理由・前提・並行可否を提案させる
- **AIで進め方を作る**: 仕様、進め方のステップ、受入条件、Claude Code への指示を Issue に書き込み、「次にやる」へ
- **AIに渡す**: Issue に `claude` ラベル。Claude Code が実装して PR を作り、あとはワークフローが テスト → デプロイ → 確認 と進める
- **並行・進捗の一覧**: ボードのトップで、全リポジトリの進行中の作業と前提待ち、リポジトリごとの完了率を表示。AI実装中は WIP 3 件まで
- **共有**: Google のメールアドレスでボードを共有(編集できる / 見るだけ)。編集者は GitHub のコラボレーターにも招待できる

## しくみ

カード = GitHub Issue です。工程は `kban:<工程>` ラベル、順位・理由などは Issue 本文の HTML コメントに入るので、カードの中身は GitHub にあります。kban 側に保存するのは、ユーザー・GitHub の連携・ボード・共有の情報だけです(Upstash Redis)。

```mermaid
flowchart LR
  A[バックログ<br>kban:backlog] -->|AIで進め方を作る| B[次にやる<br>kban:ready]
  B -->|AIに渡す<br>claude ラベル| C[AI実装中<br>kban:building]
  C -->|PR が開く| D[テスト<br>kban:testing]
  D -->|kban-ci 成功| E[デプロイ<br>kban:deploying]
  E -->|Vercel プレビュー /<br>TestFlight| F[確認<br>kban:verifying]
  F -->|OK / マージ| G[完了<br>Issue を閉じる]
  D -.->|AIに差し戻す<br>@claude コメント| C
  F -.->|AIに差し戻す| C
```

| 工程 | 誰が進めるか | 何が起きるか |
|---|---|---|
| バックログ → 次にやる | ボードの「AIで進め方を作る」 | Claude API が仕様・進め方・受入条件・指示・サイズ・前提を作り、Issue 本文に書く |
| 次にやる → AI実装中 | ボードの「AIに渡す」 | `claude` ラベルを付ける → `kban-claude` が Claude Code を起動 |
| → テスト | `kban-flow`(PR opened) | PR の URL を Issue に記録 |
| → デプロイ | `kban-flow`(kban-ci 成功) | Web は Vercel がプレビュー、iOS は `kban-testflight` |
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
├─ templates/           各アプリのリポジトリに入れるワークフローと CLAUDE.md
├─ scripts/install.sh   templates をアプリのリポジトリに組み込む
└─ board/index.html     claude.ai 上で動く軽量版(Issue を使わずに試せる)
```

## セットアップ

### 1. ボード(web/)を Vercel にデプロイ

1. Vercel で `ktrips/kban` を Import し、Root Directory を `web` にする
2. Storage → **Upstash for Redis** を追加(環境変数が自動で入る)
3. Google Cloud Console で OAuth クライアント ID(ウェブ)を作り、リダイレクト URI に `https://<ドメイン>/api/auth/callback/google` を登録
4. GitHub → Settings → Developer settings → **OAuth Apps** で新規作成し、callback URL に `https://<ドメイン>/api/github/callback` を登録
5. 環境変数を設定(`web/.env.example` を参照): `AUTH_GOOGLE_ID` `AUTH_GOOGLE_SECRET` `AUTH_SECRET` `GITHUB_CLIENT_ID` `GITHUB_CLIENT_SECRET` `ANTHROPIC_API_KEY`、必要なら `KBAN_ALLOWED_EMAILS`
6. 開いて Google でログイン → GitHub を連携 → ボードを作成 → リポジトリを追加

ローカルで動かすとき:

```bash
cd web
cp .env.example .env.local   # Upstash を空にするとメモリ保存(再起動で消える)
npm install
npm run dev                  # http://localhost:3000(OAuth のリダイレクト先も localhost で登録)
```

### 2. アプリのリポジトリに Claude Code 連携を入れる

```bash
bash scripts/install.sh ~/src/kfit both Kfit    # iOS+Web。最後の引数は Xcode の scheme
bash scripts/install.sh ~/src/kmap both Komap
```

対象リポジトリで:

1. 追加されたファイルをコミットして main に push
2. Claude GitHub App をインストール(ターミナルの Claude Code で `/install-github-app`)
3. Secrets に `CLAUDE_CODE_OAUTH_TOKEN`(`claude setup-token`)か `ANTHROPIC_API_KEY`
4. Web: Vercel の GitHub 連携を有効にする(PR ごとのプレビュー → 自動で「確認」へ)
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
