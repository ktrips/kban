"use client";

import { useCallback, useEffect, useState } from "react";
import { api, Toast, Card } from "./ui/common";
import { Boards, Me } from "./ui/Boards";
import { BoardHome, BoardData } from "./ui/BoardHome";
import { RepoBoard } from "./ui/RepoBoard";

/** Routes (hash): "" boards · "b/<id>" board · "b/<id>/<owner>/<repo>" repository board */
function parseHash() {
  const m = /^b\/([\w-]+)(?:\/([\w.-]+\/[\w.-]+))?$/.exec(decodeURIComponent(location.hash.slice(1)));
  return { board: m?.[1] || null, repo: m?.[2] || null };
}

export default function App() {
  const [route, setRoute] = useState<{ board: string | null; repo: string | null }>({ board: null, repo: null });
  const [me, setMe] = useState<Me | null>(null);
  const [data, setData] = useState<BoardData | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const toast = useCallback((m: string) => { setMsg(m); setTimeout(() => setMsg(""), 2800); }, []);

  const loadMe = useCallback(() => { api<Me>("/api/me").then(setMe).catch((e) => setErr(e.message)); }, []);
  useEffect(() => {
    const on = () => setRoute(parseHash());
    on(); window.addEventListener("hashchange", on);
    loadMe();
    const q = new URLSearchParams(location.search).get("github");
    if (q) { toast(q === "linked" ? "GitHub を連携しました" : "GitHub の連携に失敗しました。もう一度お試しください"); history.replaceState(null, "", "/" + location.hash); }
    return () => window.removeEventListener("hashchange", on);
  }, [loadMe, toast]);

  const loadBoard = useCallback(async () => {
    if (!route.board) return;
    try { setData(await api<BoardData>(`/api/boards/${route.board}`)); setErr(""); }
    catch (e) { setErr((e as Error).message); }
  }, [route.board]);
  const loadRepo = useCallback(async () => {
    if (!route.board || !route.repo) return;
    try {
      const j = await api<{ cards: Card[] }>(`/api/boards/${route.board}/r/${route.repo}/cards`);
      setData((d) => d && { ...d, cards: [...d.cards.filter((c) => c.repo !== route.repo), ...j.cards] });
    } catch (e) { setErr((e as Error).message); }
  }, [route.board, route.repo]);

  useEffect(() => { setData((d) => (d?.board.id === route.board ? d : null)); loadBoard(); }, [route.board, loadBoard]);
  useEffect(() => {
    // GitHub Actions move labels on their own; follow them.
    const tick = () => (route.repo ? loadRepo() : loadBoard());
    const t = setInterval(tick, 20000);
    window.addEventListener("focus", tick);
    return () => { clearInterval(t); window.removeEventListener("focus", tick); };
  }, [route.repo, loadRepo, loadBoard]);

  const go = (full: string | null) => { location.hash = full ? `b/${route.board}/${full}` : `b/${route.board}`; };
  const repo = data?.board.repos.find((r) => r.full === route.repo);

  let body: React.ReactNode;
  if (!me) body = <p className="note">{err || "読み込み中…"}</p>;
  else if (!route.board) body = <Boards me={me} reloadMe={loadMe} toast={toast} />;
  else if (!data) body = err ? <div className="banner">{err} <a href="#">ボード一覧へ</a></div> : <p className="note">読み込み中…</p>;
  else if (route.repo && repo)
    body = <RepoBoard budget={data.board.budgetTokens} weekLimit={data.board.weekTokens} boardId={data.board.id} boardName={data.board.name} canEdit={data.canEdit} repo={repo} repos={data.board.repos} cards={data.cards} go={go} reload={loadRepo} toast={toast} />;
  else body = <BoardHome data={data} go={go} reload={loadBoard} toast={toast} />;

  return (
    <div className="wrap">
      {err && me && data && <div className="banner">{err}</div>}
      {body}
      <Toast msg={msg} />
    </div>
  );
}
