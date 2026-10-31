"use client";

import { useEffect, useState } from "react";
import { api } from "./common";
import type { ClaudeStatus } from "@/lib/github";

export function useClaudeStatus(base: string) {
  const [s, setS] = useState<ClaudeStatus | null>(null);
  const load = () => api<ClaudeStatus>(`${base}/claude`).then(setS).catch(() => setS(null));
  useEffect(() => { load(); }, [base]);
  return [s, load] as const;
}

export const linked = (s: ClaudeStatus | null) => !!s && s.workflows && s.secret !== null;

/** リポジトリと「自分の Claude Code」をつなぐ: ワークフローを入れる PR と、認証(Secrets)の登録。 */
export function ClaudeLink({ base, isOwner, target, toast }: { base: string; isOwner: boolean; target: "web" | "ios" | "both"; toast: (m: string) => void }) {
  const [s, reload] = useClaudeStatus(base);
  const [busy, setBusy] = useState("");
  const [scheme, setScheme] = useState("");
  const [secret, setSecret] = useState({ name: "CLAUDE_CODE_OAUTH_TOKEN", value: "" });

  async function run(key: string, body: Record<string, unknown>, done: (r: { pr?: string }) => string) {
    setBusy(key);
    try { const r = await api<{ pr?: string }>(`${base}/claude`, "POST", body); toast(done(r)); await reload(); }
    catch (e) { toast((e as Error).message); }
    finally { setBusy(""); }
  }
  const row = (ok: boolean | null, label: string, extra?: React.ReactNode) => (
    <li><span className={`chip st ${ok === null ? "" : ok ? "ok" : "ng"}`}>{ok === null ? "未確認" : ok ? "OK" : "未設定"}</span> {label} {extra}</li>
  );

  return (
    <div className="section">
      <h3>Claude Code 連携</h3>
      <p className="note">「AIに渡す」で、このリポジトリの GitHub Actions 上であなたの Claude Code が動きます。使われるのは下で登録するあなたの認証です。</p>
      {!s ? <p className="note">状態を確認中…</p> : (
        <ul className="checks">
          {row(s.workflows, "ワークフロー(.github/workflows/kban-claude.yml)", s.pr && !s.workflows ? <a href={s.pr} target="_blank" rel="noreferrer">PR をマージしてください</a> : null)}
          {row(s.secret === "unknown" ? null : s.secret !== null, "認証(Secrets)", s.secret && s.secret !== "unknown" ? <span className="note">{s.secret}</span> : null)}
          <li><span className="chip">手動</span> Claude GitHub App を入れる <a href="https://github.com/apps/claude" target="_blank" rel="noreferrer">インストール</a><span className="note"> (リポジトリを選ぶ)</span></li>
        </ul>
      )}
      {isOwner ? <>
        <div className="field" style={{ marginTop: 8 }}>
          {target !== "web" && <><label htmlFor="cs">Xcode の scheme(iOS)</label><input id="cs" value={scheme} onChange={(e) => setScheme(e.target.value)} placeholder="例: Komb" /></>}
          <div className="btns"><button className="btn" disabled={!!busy || (target !== "web" && !scheme.trim())} onClick={() => run("install", { action: "install", scheme }, (r) => `PR を作りました: ${r.pr}`)}>{busy === "install" ? "作成中…" : s?.workflows ? "ワークフローを更新する PR を作る" : "ワークフローを入れる PR を作る"}</button></div>
        </div>
        <div className="field">
          <label htmlFor="sv">あなたの Claude Code の認証を登録</label>
          <div className="row2">
            <select value={secret.name} onChange={(e) => setSecret({ ...secret, name: e.target.value })} aria-label="認証の種類">
              <option value="CLAUDE_CODE_OAUTH_TOKEN">Claude の契約 / Subscription(setup-token)</option>
              <option value="ANTHROPIC_API_KEY">Anthropic API キー(従量課金)</option>
            </select>
            <input id="sv" type="password" autoComplete="off" value={secret.value} onChange={(e) => setSecret({ ...secret, value: e.target.value })} placeholder="トークンを貼り付け" />
          </div>
          <span className="note">契約のトークンは、手元のターミナルで <code>claude setup-token</code> を実行すると出ます。GitHub の暗号化して Secrets に保存し、kban には残しません。どちらか一方だけが登録されます(登録すると、もう一方は削除されます)。</span>
          <div className="btns"><button className="btn primary" disabled={!!busy || !secret.value.trim()} onClick={() => run("secret", { action: "secret", name: secret.name, value: secret.value }, () => { setSecret({ ...secret, value: "" }); return "認証を登録しました"; })}>{busy === "secret" ? "登録中…" : "登録"}</button></div>
        </div>
      </> : <p className="note">登録とワークフローの追加は、ボードの持ち主だけができます。</p>}
    </div>
  );
}
