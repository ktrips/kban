"use client";

import { useEffect, useRef } from "react";
import { api, type Card } from "./common";
import { rolloverTargets, weekOf } from "@/lib/sprint";

/** 週が終わっても終わっていないカードを、開いたときに今週のスプリントへ自動で回す(編集できる人のとき、週に1回だけ) */
export function useRollover(boardId: string, cards: Card[], canEdit: boolean, reload: () => Promise<void>, toast: (m: string) => void) {
  const done = useRef("");
  useEffect(() => {
    const week = weekOf();
    const key = `${boardId}:${week}`;
    if (!canEdit || done.current === key || !rolloverTargets(cards, week).length) return;
    done.current = key; // 失敗しても繰り返さない
    api<{ moved: number }>(`/api/boards/${boardId}/rollover`, "POST", { week })
      .then(async (r) => { if (r.moved) { toast(`終わっていない ${r.moved} 件を今週のスプリントに回しました`); await reload(); } })
      .catch((e) => toast((e as Error).message));
  }, [boardId, cards, canEdit, reload, toast]);
}
