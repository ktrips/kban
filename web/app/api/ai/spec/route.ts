import { NextResponse } from "next/server";
import { listCards, updateCard } from "@/lib/github";
import { makeSpec } from "@/lib/ai";

export async function POST(req: Request) {
  try {
    const { id, feedback } = await req.json();
    const card = (await listCards()).find((c) => c.id === id);
    if (!card) return NextResponse.json({ error: "カードが見つかりません" }, { status: 404 });
    const s = await makeSpec(card, feedback);
    await updateCard(card.repo, card.number, {
      title: s.title,
      spec: s.spec,
      prompt: s.prompt.replace(/<issue番号>/g, String(card.number)),
      criteria: s.criteria.map((text) => ({ text, done: false })),
      stage: card.stage === "idea" ? "spec" : undefined,
    });
    return NextResponse.json({ ok: true, spec: s });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
