"use client";

import { useEffect, useRef } from "react";
import { api, type Card } from "./common";
import { exitTargets, rolloverTargets, weekOf } from "@/lib/sprint";

/**
 * スプリントの自動整理(編集できる人が開いたとき)。
 * - 確認以降に進んだカードは、スプリントから外す
 * - 週が終わっても実装が終わっていないカードは、今週のスプリントへ回す
 */
export function useRollover(boardId: string, cards: Card[], canEdit: boolean, reload: () => Promise<void>, toast: (m: string) => void) {
  const tried = useRef("");
  useEffect(() => {
    const week = weekOf();
    const targets = [...exitTargets(cards), ...rolloverTargets(cards, week)];
    const sig = `${boardId}:${week}:${targets.map((c) => c.id).sort().join(",")}`;
    if (!canEdit || !targets.length || tried.current === sig) return;
    tried.current = sig; // 失敗しても同じ内容では繰り返さない
    api<{ moved: number; cleared: number }>(`/api/boards/${boardId}/rollover`, "POST", { week })
      .then(async (r) => {
        const msg = [r.cleared && `確認に進んだ ${r.cleared} 件をスプリントから外しました`, r.moved && `終わっていない ${r.moved} 件を今週に回しました`].filter(Boolean).join("。");
        if (msg) { toast(msg); await reload(); }
      })
      .catch((e) => toast((e as Error).message));
  }, [boardId, cards, canEdit, reload, toast]);
}
