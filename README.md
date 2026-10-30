# kenban

アイデアをカンバンに書き溜め、AI で仕様化し、GitHub Actions 上の Claude Code に実装させ、テスト → デプロイ → 確認までを 1 枚のボードで回す仕組みです。Web アプリ(Vercel)と iOS アプリ(TestFlight)の両方に対応します。

## しくみ

カード = GitHub Issue です。工程は Issue の `kenban:<工程>` ラベルで表し、ボードはそれを読み書きするだけなので、データベースは要りません。

```mermaid
flowchart LR
  A[アイデア<br>kenban:idea] -->|AIで仕様化<br>Claude API| B[仕様化<br>kenban:spec]
  B -->|AIに指示<br>claude ラベル付与| C[AIに指示<br>kenban:queued]
  C -->|kenban-claude 起動| D[実装中<br>kenban:building]
  D -->|PR が開く| E[テスト<br>kenban:testing]
  E -->|kenban-ci 成功| F[デプロイ<br>kenban:deploying]
  F -->|Vercel プレビュー /<br>TestFlight アップロード| G[確認<br>kenban:verifying]
  G -->|OK| H[完了<br>Issue を閉じる]
  E -.->|AIに差し戻す<br>@claude コメント| D
  G -.->|AIに差し戻す| D
```

| 工程 | 誰が進めるか | 何が起きるか |
|---|---|---|
| アイデア → 仕様化 | ボードの「AIで仕様化」 | Claude API が仕様・受入条件・Claude Code への指示を作り、Issue 本文に書き込む |
| 仕様化 → AIに指示 | ボードの「AIに指示する」 | Issue に `claude` ラベル。`kenban-claude` が Claude Code を起動 |
| → 実装中 | `kenban-claude` | ブランチ `claude/issue-N-…` で実装、`gh pr create`(本文に `Closes #N`) |
| → テスト | `kenban-flow`(PR opened) | PR の URL を Issue に記録 |
| → デプロイ | `kenban-flow`(kenban-ci 成功) | Web は Vercel がプレビューを作成、iOS は `kenban-testflight` が開始 |
| → 確認 | `kenban-flow`(deployment_status)/ `kenban-testflight` | プレビュー URL か TestFlight のビルド番号を記録 |
| 確認 → 完了 | ボードの「OK」 | 受入条件にチェックを入れ、Issue を閉じる。PR マージでも完了に進む |
| 差し戻し | ボードの「AIに差し戻す」 | Claude API が修正指示を書き、PR に `@claude` 付きでコメント。同じ PR に追加コミットされる |

## 構成

```
kenban/
├─ web/                Next.js 製のボード(PWA。iPhone ではホーム画面に追加してアプリとして使う)
│  ├─ app/             画面と API(/api/cards, /api/ai/spec, /api/ai/fix)
│  ├─ lib/             GitHub 連携、Issue 本文の形式、工程定義、Claude API
│  └─ kenban.config.json  管理するプロジェクトとリポジトリ
├─ templates/          各アプリのリポジトリに入れるワークフローと CLAUDE.md
├─ scripts/install.sh  templates をリポジトリに組み込み、ラベルを作る
└─ board/index.html    claude.ai 上で動く軽量版ボード(Issue を使わずに試せる)
```

## セットアップ

### 1. アプリのリポジトリに組み込む(例: komb)

```bash
bash scripts/install.sh ~/src/komb ios Komb     # iOS。最後の引数は Xcode の scheme
bash scripts/install.sh ~/src/myweb web          # Web
```

その後、対象リポジトリで:

1. 追加されたファイルをコミットして main に push
2. Claude GitHub App をインストール(ターミナルの Claude Code で `/install-github-app`)。App のトークンで push されるので、PR で CI が走ります
3. Settings → Secrets に `CLAUDE_CODE_OAUTH_TOKEN`(`claude setup-token` で発行)か `ANTHROPIC_API_KEY` を登録
4. Web: Vercel の GitHub 連携を有効にする(PR ごとのプレビュー → 自動で「確認」へ)
5. iOS: TestFlight 用の Secrets を登録し、手元で一度 `fastlane match appstore` を実行

| Secret | 用途 |
|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` / `ANTHROPIC_API_KEY` | Claude Code の実行 |
| `ASC_KEY_ID` / `ASC_ISSUER_ID` / `ASC_KEY_P8` | App Store Connect API キー |
| `MATCH_GIT_URL` / `MATCH_PASSWORD` / `MATCH_GIT_BASIC_AUTHORIZATION` | 署名証明書(fastlane match) |

### 2. ボードを動かす

```bash
cd web
cp .env.example .env.local    # GITHUB_TOKEN, ANTHROPIC_API_KEY, KENBAN_PASSWORD を設定
npm install
npm run dev                   # http://localhost:3000
```

- `GITHUB_TOKEN` は fine-grained token。対象リポジトリに Issues: Read and write、Metadata: Read
- `kenban.config.json` に管理するリポジトリを並べる(`target` は web / ios / both)
- 本番は Vercel に `web/` を Root Directory としてデプロイし、同じ環境変数を設定。Basic 認証で自分だけが使えます
- iPhone では Safari で開いて「ホーム画面に追加」するとアプリとして起動します

### 3. 使い方

1. 思いついたら上の入力欄にひとこと → Issue がアイデアとして作られる
2. 「AIで仕様化」→ 仕様と受入条件を確認・修正して「Issue に保存」
3. 「AIに指示する」→ あとは自動で 実装中 → テスト → デプロイ → 確認 と進む
4. 確認でプレビュー / TestFlight を触り、受入条件にチェック → OK か「AIに差し戻す」

「実装中」は WIP 3 件を超えると赤く表示されます。

## 開発

```bash
cd web
npm test          # Issue 本文の形式と工程判定のテスト
npm run typecheck
npm run build
```

## 注意点

- `kenban-ci` というワークフロー名で CI を見ています。名前を変えるときは `kenban-flow.yml` と `kenban-testflight.yml` も合わせて変更してください
- `both` のリポジトリでは Web の CI 成功でも TestFlight が動きます。気になる場合は `kenban-testflight.yml` の `workflows` を iOS 側だけにしてください
- `anthropics/claude-code-action@v1` の入力(`label_trigger`、`claude_args` など)はアクションの更新で変わることがあります。動かないときはアクションの README を確認してください
- ボードは 20 秒ごとと画面に戻ったときに GitHub を読み直します
