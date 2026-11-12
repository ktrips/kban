"use client";

import { useState } from "react";

/** カードに添付されたスクリーンショット。タップで原寸を開く。読み込めないときは理由が分かる表示にする。 */
export function Shots({ urls }: { urls: string[] }) {
  const [bad, setBad] = useState<Record<string, boolean>>({});
  if (!urls.length) return null;
  return (
    <div className="thumbs">
      {urls.map((u) => bad[u]
        ? <a key={u} className="thumb broken" href={u} target="_blank" rel="noreferrer">画像を読み込めません(開いて確認)</a>
        : <a key={u} className="thumb big" href={u} target="_blank" rel="noreferrer"><img src={u} alt="スクリーンショット" loading="lazy" onError={() => setBad((b) => ({ ...b, [u]: true }))} /></a>)}
    </div>
  );
}
