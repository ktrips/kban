/**
 * カードの「背景」に入っている、kban の添付画像(kban-attachments ブランチの Markdown 画像)を、本文から分けたり戻したりする。
 * 画面では本文だけを編集させ、画像は別に表示する。保存するときは画像の行を末尾に戻す(編集で画像が消えないように)。
 */
const IMG = /!\[[^\]]*\]\(https:\/\/github\.com\/[^)\s]+\/blob\/kban-attachments\/attachments\/([\w.-]+)\?raw=true\)/g;

export function splitIdea(idea: string, imgBase: string) {
  const found = [...idea.matchAll(IMG)];
  return {
    text: idea.replace(IMG, "").replace(/\n{3,}/g, "\n\n").trim(),
    images: found.map((m) => `${imgBase}/${m[1]}`),
    md: found.map((m) => m[0]),
  };
}

export const joinIdea = (text: string, md: string[]) => [text.trim(), ...md].filter(Boolean).join("\n\n");
export const imageCount = (idea: string) => (idea.match(IMG) || []).length;
