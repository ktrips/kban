#!/usr/bin/env bash
# kban: Claude Code のステータスライン。Claude の契約の使用率(5時間枠・7日枠)を kban に送り、画面の下に % を出す。
#
# 使い方(~/.claude/settings.json):
#   "statusLine": { "type": "command", "command": "KBAN_TOKEN=kbl_… bash ~/.claude/kban-statusline.sh" }
#   トークンは kban のトップの「Claude の使用率を kban に送る」で作る。
#
# 送るのは rate_limits の five_hour / seven_day(使用率とリセット時刻)だけ。作業フォルダ・モデル・会話などは送らない。
# 送信は 1 分に 1 回まで、裏で行う(ステータスラインの表示は待たせない)。
# rate_limits は Claude の契約(Pro / Max / Ultra)でログインした Claude Code で、セッションの最初の応答のあとに届く。
# 自分のステータスラインがすでにあるときは KBAN_NEXT にそのコマンドを入れると、その出力の後ろに % を足す。

input=$(cat)
KBAN_URL=${KBAN_URL:-https://kban--kbanprj.asia-east1.hosted.app}

# 1 行目: 送る JSON / 2 行目: 表示する文字。jq → python3 → node の順に、あるもので取り出す
pick() {
  if command -v jq >/dev/null 2>&1; then
    jq -r '.rate_limits as $r | if ($r.five_hour or $r.seven_day) then
      ({rate_limits: {five_hour: $r.five_hour, seven_day: $r.seven_day}} | tojson),
      ([if $r.five_hour then "5h \($r.five_hour.used_percentage | floor)%" else empty end,
        if $r.seven_day then "7d \($r.seven_day.used_percentage | floor)%" else empty end] | join(" · "))
      else empty end' 2>/dev/null
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c '
import json, sys
r = (json.load(sys.stdin) or {}).get("rate_limits") or {}
f, s = r.get("five_hour"), r.get("seven_day")
if f or s:
    print(json.dumps({"rate_limits": {"five_hour": f, "seven_day": s}}))
    print(" · ".join([x for x in [f and "5h %d%%" % f["used_percentage"], s and "7d %d%%" % s["used_percentage"]] if x]))
' 2>/dev/null
  elif command -v node >/dev/null 2>&1; then
    node -e '
let t = ""; process.stdin.on("data", (d) => (t += d)).on("end", () => {
  try {
    const r = JSON.parse(t).rate_limits || {}; const f = r.five_hour, s = r.seven_day;
    if (!f && !s) return;
    console.log(JSON.stringify({ rate_limits: { five_hour: f, seven_day: s } }));
    console.log([f && `5h ${Math.floor(f.used_percentage)}%`, s && `7d ${Math.floor(s.used_percentage)}%`].filter(Boolean).join(" · "));
  } catch {}
});' 2>/dev/null
  fi
}

out=$(printf '%s' "$input" | pick)
payload=$(printf '%s\n' "$out" | sed -n 1p)
shown=$(printf '%s\n' "$out" | sed -n 2p)

if [ -n "$payload" ] && [ -n "$KBAN_TOKEN" ]; then
  stamp="${TMPDIR:-/tmp}/kban-limits-$(id -u)"
  if [ -z "$(find "$stamp" -mmin -1 2>/dev/null)" ]; then
    touch "$stamp"
    ( curl -fsS -m 5 -X POST "$KBAN_URL/api/limits" -H "Authorization: Bearer $KBAN_TOKEN" -H "content-type: application/json" \
        --data-binary "$payload" >/dev/null 2>&1 & )
  fi
fi

prefix=""
[ -n "$KBAN_NEXT" ] && prefix=$(printf '%s' "$input" | sh -c "$KBAN_NEXT" 2>/dev/null)
if [ -n "$prefix" ] && [ -n "$shown" ]; then printf '%s  %s\n' "$prefix" "$shown"
elif [ -n "$prefix" ]; then printf '%s\n' "$prefix"
elif [ -n "$shown" ]; then printf 'Claude %s\n' "$shown"
fi
