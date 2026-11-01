"use client";

/**
 * 指でのドラッグ。HTML の draggable はスマホのタッチでは動かないので、タッチだけ自前で行う。
 * 長押し(LONG ms)で持ち上げ、指の下の [data-drop] に落とす。長押し前に指が動いたらスクロールとして扱い、何もしない。
 * 落とし先は data-drop の文字列(例: "sprint:2026-11-02", "lane:ready", "card:12")で受け取る。
 */
const LONG = 350;
const SLOP = 10;

export function touchDrag(e: React.TouchEvent, label: string, onDrop: (target: string) => void) {
  if (e.touches.length !== 1) return;
  const t0 = e.touches[0];
  const x0 = t0.clientX, y0 = t0.clientY;
  let active = false;
  let ghost: HTMLDivElement | null = null;
  let over: Element | null = null;

  const targetAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest("[data-drop]") ?? null;
  const mark = (el: Element | null) => { if (over === el) return; over?.classList.remove("dragover"); el?.classList.add("dragover"); over = el; };
  const place = (x: number, y: number) => { if (ghost) ghost.style.transform = `translate(${x}px, ${y}px) translate(-50%, -120%)`; };

  const timer = window.setTimeout(() => {
    active = true;
    ghost = document.createElement("div");
    ghost.className = "drag-ghost";
    ghost.textContent = label;
    document.body.appendChild(ghost);
    place(x0, y0);
    document.body.classList.add("touch-dragging");
    navigator.vibrate?.(12);
  }, LONG);

  const move = (ev: TouchEvent) => {
    const t = ev.touches[0];
    if (!active) { if (Math.hypot(t.clientX - x0, t.clientY - y0) > SLOP) end(); return; }
    ev.preventDefault(); // 持ち上げている間はスクロールさせない
    place(t.clientX, t.clientY);
    mark(targetAt(t.clientX, t.clientY));
    // 画面の端に近づいたらスクロールして、見えていない落とし先(上のスプリントなど)にも届くようにする
    const edge = 70;
    if (t.clientY < edge) window.scrollBy(0, -14);
    else if (t.clientY > window.innerHeight - edge) window.scrollBy(0, 14);
  };
  const finish = (ev: TouchEvent) => {
    const t = ev.changedTouches[0];
    const drop = active && t ? targetAt(t.clientX, t.clientY)?.getAttribute("data-drop") : null;
    if (active) {
      ev.preventDefault();
      // 指を離したときの click でカードが開かないようにする
      const swallow = (c: MouseEvent) => { c.stopPropagation(); c.preventDefault(); };
      window.addEventListener("click", swallow, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 400);
    }
    end();
    if (drop) onDrop(drop);
  };
  function end() {
    window.clearTimeout(timer);
    window.removeEventListener("touchmove", move);
    window.removeEventListener("touchend", finish);
    window.removeEventListener("touchcancel", end);
    mark(null);
    ghost?.remove();
    document.body.classList.remove("touch-dragging");
  }
  window.addEventListener("touchmove", move, { passive: false });
  window.addEventListener("touchend", finish, { passive: false });
  window.addEventListener("touchcancel", end);
}
