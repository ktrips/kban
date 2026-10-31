## kban のルール(Claude Code 向け)

このリポジトリの Issue は kban(カンバン)で管理されています。`claude` ラベルの Issue を実装するときは次を守ってください。

- Issue 本文の「仕様」「進め方」「受入条件」「Claude Codeへの指示」がタスクの定義です。「進め方」の順に進め、受入条件はすべて満たすこと。
- 「前提」に挙がった Issue が未完了なら、その変更に依存しない範囲だけを実装し、残りを PR 本文に書く。
- 作業ブランチ名は `claude/issue-<番号>-<短い説明>` にする。
- 変更に合ったテストを追加・更新し、CI(`kban-ci`)と同じコマンドが手元で通ることを確認する。
  - Web: `npm ci && npm run lint --if-present && npm test --if-present && npm run build --if-present`
  - iOS: `xcodebuild test -scheme <scheme> -destination 'platform=iOS Simulator,name=iPhone 16'`
- 完了したら `gh pr create` で PR を作る。本文には必ず次を書く。
  - `Closes #<Issue番号>`(kban がカードを追うのに使います)
  - 進め方の各ステップと受入条件ごとの結果(チェックリスト)
  - 実行したテストと結果
  - 人が確認する手順(画面のどこを、何を見ればよいか)
- `@claude` で差し戻しコメントが来たら、同じ PR のブランチに追加コミットする。新しい PR は作らない。
- 仕様にない大きな変更や依存追加が必要なら、実装せず Issue にコメントで相談する。
