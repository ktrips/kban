# kban — Claude Code 向けメモ

Ken(GitHub: ktrips)の個人開発用カンバン。日本語 UI。ユーザーとのやりとりも日本語で。

## 何をするものか

リポジトリ(ktrips/kfit、ktrips/kmap など)ごとに「次に作りたいこと」をバックログに書き、
優先順位 → 進め方 → Claude Code(GitHub Actions)で実装 → テスト → デプロイ(Firebase / TestFlight)→ 確認 → 完了
を1枚のボードで回す。何からやるか・並行して何が進んでいるか・どこまで終わったかを一覧できることが中心の要件。

## 設計の要点

- **カード = GitHub Issue**(`kban` ラベル)。工程は `kban:<stage>` ラベル。stage は
  `backlog → ready → building → testing → deploying → verifying → done`(`web/lib/stages.ts`)
- Issue 本文は固定の Markdown セクション(背景 / 仕様 / 進め方 / 受入条件 / 前提 / Claude Codeへの指示)と、
  `<!-- kban:rank=… -->` などの HTML コメント(rank, reason, parallel, pr, preview)。形式は `web/lib/body.ts`、テストあり
- **ログインは Google(Auth.js v5, `web/auth.ts`)**。uid は `google:<sub>`。
  GitHub は自前の OAuth(`/api/github/connect` → `/callback`)で、トークンは AES-GCM で暗号化して Firestore のユーザーに保存
- **ボード** = リポジトリの集まり。持ち主 + メンバー(email → editor/viewer)。保存は `web/lib/store.ts`(Firestore、ローカルはメモリ)
- **権限は `web/lib/access.ts` の `access(boardId, "view"|"edit"|"owner")` で一元化**。
  GitHub 操作は常にボード持ち主のトークンで行う(共有相手は GitHub 権限不要)
- 自動で工程を進めるのは各アプリ側のワークフロー(`templates/.github/workflows/kban-*.yml` + `templates/.github/kban/resolve.js`)。
  `scripts/install.sh` でアプリのリポジトリにコピーする。工程は前にしか進めない(resolve.js)
- AI(仕様化・優先順位・差し戻し)はサーバーから Claude API(`web/lib/ai.ts`、`KBAN_MODEL`)

## iPhone

- `ios/`(SwiftUI + WKWebView + 共有シート拡張。XcodeGen)。UI は web/ を表示するだけ。Google は WebView ログイン不可なので、
  `ASWebAuthenticationSession` → `/api/native/start` → `kban://done?code&token` → `/api/native/exchange`(セッション Cookie を発行)
- 共有シートは個人トークン(`kbt_…`、`store.ts` にハッシュで保存)を Bearer で `/api/capture` に送る。追加処理は `lib/capture.ts` で Web の追加欄と共通
- スクリーンショットは `lib/attach.ts` が `kban-attachments` ブランチに commit し、Issue の背景に Markdown 画像で入れる。表示は `/api/boards/.../img/[name]`
- **未検証**: Swift のコードはこの環境(Linux)でビルドしていない。`.github/workflows/ios-build.yml` と実機で確認すること

## もう一つのボード(claude.ai 版)

`board/index.html` は claude.ai の Artifact として公開しているボード(Ken の claude.ai アカウント)。
データは Artifact のデータベース、AI は Artifact の sample、リポジトリ一覧は Claude Code Remote コネクタの list_repos。
Issue とは同期していない(Issue 作成は GitHub の新規 Issue 画面へのリンクで渡す)。本番は web/。
見た目(CSS トークン)は両者で共通。`web/app/globals.css` は board/index.html の `<style>` から作っている。

## コマンド

```bash
cd web && npm install
npm test           # node --test(body / stages / store)
npm run typecheck
npm run build
npm run dev        # .env.local が必要(.env.example 参照)
```

## 現状と残作業

できている:
- web: Google ログイン、GitHub 連携、ボード作成・削除・改名、リポジトリ追加/設定/削除、共有(email + 権限、任意で GitHub コラボレーター招待)、
  リポジトリのボード(バックログ順位、AI 優先順位、AI 進め方、前提・並行可・サイズ、WIP、進捗)、見るだけモード
- templates: Claude Code 起動、工程自動移動、Web CI、iOS CI、TestFlight
- テスト・型チェック・ビルドは通る。実際の Google / GitHub / Firebase / Firestore ではまだ動かしていない

次にやること(優先順):
1. Firebase App Hosting にデプロイ(https://kban.ktrips.net、設定は `web/apphosting.yaml`・`firebase.json`)して実環境で通しで確認(Google OAuth、GitHub OAuth App、Firestore、ANTHROPIC_API_KEY)
2. kfit / kmap に `scripts/install.sh` を入れ、1件を backlog → done まで通す。`claude-code-action@v1` の入力名を実物で確認
3. GitHub の 1 リクエストずつのカード更新(setRanks)が遅ければ GraphQL でまとめる
4. ボード更新は 20 秒ポーリング。必要なら GitHub Webhook → 再読込に変える
5. 共有の招待メール送信(いまは相手がログインすると表示されるだけ)
6. claude.ai 版ボードのデータを web 版(Issue)へ移す仕組み(必要なら)
