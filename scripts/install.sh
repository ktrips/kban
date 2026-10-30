#!/usr/bin/env bash
# kenban を既存リポジトリに組み込む。
#   bash scripts/install.sh <対象リポジトリのパス> <web|ios|both> [iOSのscheme]
# 例: bash scripts/install.sh ~/src/komb ios Komb
set -euo pipefail

TARGET=${1:?対象リポジトリのパスを指定してください}
KIND=${2:?web / ios / both を指定してください}
SCHEME=${3:-}
HERE="$(cd "$(dirname "$0")/.." && pwd)"
T="$HERE/templates"

case "$KIND" in web|ios|both) ;; *) echo "web / ios / both のどれかを指定してください" >&2; exit 1;; esac
if [ "$KIND" != web ] && [ -z "$SCHEME" ]; then echo "iOS では scheme 名が必要です(例: Komb)" >&2; exit 1; fi
[ -d "$TARGET/.git" ] || { echo "$TARGET は git リポジトリではありません" >&2; exit 1; }

mkdir -p "$TARGET/.github/kenban" "$TARGET/.github/workflows"
cp "$T/.github/kenban/resolve.js" "$TARGET/.github/kenban/"
printf '{\n  "target": "%s",\n  "scheme": "%s",\n  "simulator": "iPhone 16"\n}\n' "$KIND" "$SCHEME" > "$TARGET/.github/kenban/config.json"
cp "$T/.github/workflows/kenban-flow.yml" "$TARGET/.github/workflows/"

# Claude Code の実行環境: iOS のビルドとテストには macOS が必要
if [ "$KIND" = web ]; then RUNNER=ubuntu-latest; TOOLS='Bash(npm:*),Bash(npx:*),Bash(node:*)'
else RUNNER=macos-15; TOOLS='Bash(npm:*),Bash(npx:*),Bash(xcodebuild:*),Bash(swift:*),Bash(xcrun:*)'; fi
sed -e "s/__RUNNER__/$RUNNER/" -e "s/__TOOLS__/$TOOLS/" "$T/.github/workflows/kenban-claude.yml" > "$TARGET/.github/workflows/kenban-claude.yml"

if [ "$KIND" = web ]; then
  cp "$T/.github/workflows/kenban-ci.web.yml" "$TARGET/.github/workflows/kenban-ci.yml"
elif [ "$KIND" = ios ]; then
  cp "$T/.github/workflows/kenban-ci.ios.yml" "$TARGET/.github/workflows/kenban-ci.yml"
else
  cp "$T/.github/workflows/kenban-ci.web.yml" "$TARGET/.github/workflows/kenban-ci-web.yml"
  cp "$T/.github/workflows/kenban-ci.ios.yml" "$TARGET/.github/workflows/kenban-ci.yml"
fi
if [ "$KIND" != web ]; then
  cp "$T/.github/workflows/kenban-testflight.yml" "$TARGET/.github/workflows/"
  mkdir -p "$TARGET/fastlane"
  [ -f "$TARGET/fastlane/Fastfile" ] && echo "fastlane/Fastfile は既にあるので上書きしません(templates/fastlane/Fastfile の beta レーンを参考に追加してください)" \
    || cp "$T/fastlane/Fastfile" "$TARGET/fastlane/Fastfile"
fi

# CLAUDE.md に kenban のルールを追記(重複しない)
if ! grep -q "## kenban のルール" "$TARGET/CLAUDE.md" 2>/dev/null; then
  { [ -f "$TARGET/CLAUDE.md" ] && echo; cat "$T/CLAUDE.kenban.md"; } >> "$TARGET/CLAUDE.md"
fi

# ラベル作成(gh CLI が必要)
if command -v gh >/dev/null; then
  cd "$TARGET"
  mk() { gh label create "$1" --color "$2" --description "$3" --force >/dev/null 2>&1 && echo "  label: $1" || echo "  label 作成失敗(gh auth を確認): $1"; }
  mk kenban 18212B "kenban のカード"
  mk claude D9480F "Claude Code に実装を依頼"
  mk kenban:idea 8A94A3 "アイデア"
  mk kenban:spec 5C7CFA "仕様化"
  mk kenban:queued D9480F "AIに指示"
  mk kenban:building AE3EC9 "実装中"
  mk kenban:testing C27A00 "テスト"
  mk kenban:deploying 1C7ED6 "デプロイ"
  mk kenban:verifying 0C8599 "確認"
  mk kenban:done 2B8A3E "完了"
  mk kenban:web 868E96 "対象: Web"
  mk kenban:ios 868E96 "対象: iOS"
  mk kenban:both 868E96 "対象: iOS+Web"
  mk kenban:p-high C92A2A "優先度 高"
  mk kenban:p-low ADB5BD "優先度 低"
else
  echo "gh CLI が見つからないため、ラベルは作成していません(README の一覧を参照)"
fi

cat <<EOF

kenban を組み込みました: $TARGET ($KIND)
次にやること:
  1. 変更をコミットして main に push
  2. Claude GitHub App をインストール(Claude Code で /install-github-app)
  3. Secrets に CLAUDE_CODE_OAUTH_TOKEN か ANTHROPIC_API_KEY を設定
EOF
[ "$KIND" != web ] && echo "  4. TestFlight 用 Secrets: ASC_KEY_ID / ASC_ISSUER_ID / ASC_KEY_P8 / MATCH_GIT_URL / MATCH_PASSWORD / MATCH_GIT_BASIC_AUTHORIZATION"
[ "$KIND" != ios ] && echo "  ・Web は Vercel の GitHub 連携を有効にすると、PR ごとのプレビューで自動的に「確認」へ進みます"
true
