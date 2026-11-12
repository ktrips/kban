"use client";

import { useState } from "react";
import { api } from "./common";
import type { RepoSettings } from "@/lib/store";
import { Sheet } from "./Sheet";
import { ClaudeLink } from "./ClaudeLink";

/** リポジトリの設定(表示名・対象・概要・Claude Code 連携・ボードから外す)。ボードのトップとリポジトリページの両方から開く */
export function RepoSettingsSheet({ isOwner, boardId, repo, onClose, reload, toast, onRemoved }: { boardId: string; isOwner: boolean; repo: RepoSettings; onClose: () => void; reload: () => Promise<void>; toast: (m: string) => void; onRemoved?: () => void }) {
  const [f, setF] = useState({ name: repo.name, target: repo.target, about: repo.about });
  async function save() { try { await api(`/api/boards/${boardId}/repos`, "PATCH", { full: repo.full, ...f }); await reload(); onClose(); toast("保存しました"); } catch (e) { toast((e as Error).message); } }
  async function remove() { try { await api(`/api/boards/${boardId}/repos?full=${encodeURIComponent(repo.full)}`, "DELETE"); onClose(); onRemoved?.(); await reload(); toast("ボードから外しました"); } catch (e) { toast((e as Error).message); } }
  return (
    <Sheet title={`${repo.name} の設定`} onClose={onClose}>
      <div className="section">
        <div className="row2">
          <div className="field"><label htmlFor="rsName">表示名</label><input id="rsName" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="field"><label htmlFor="rsT">対象</label><select id="rsT" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value as RepoSettings["target"] })}><option value="web">Web</option><option value="ios">iOS</option><option value="both">iOS+Web</option></select></div>
        </div>
        <div className="field"><label htmlFor="rsAbout">アプリの概要(AI が優先順位や仕様を考えるときに使います)</label><textarea id="rsAbout" value={f.about} onChange={(e) => setF({ ...f, about: e.target.value })} /></div>
        <div className="btns"><button className="btn primary" onClick={save}>保存</button></div>
      </div>
      <ClaudeLink base={`/api/boards/${boardId}/r/${repo.full}`} isOwner={isOwner} target={repo.target} toast={toast} />
      <div className="section"><h3>ボードから外す</h3><p className="note">GitHub の Issue とラベルは残ります。</p><div className="btns"><button className="btn" onClick={remove}>{repo.name} を外す</button></div></div>
    </Sheet>
  );
}
