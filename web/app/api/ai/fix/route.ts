import { NextResponse } from "next/server";
import { listCards, requestFix } from "@/lib/github";
import { makeFix } from "@/lib/ai";

export async function POST(req: Request) {
  try {
    const { id, feedback } = await req.json();
    const card = (await listCards()).find((c) => c.id === id);
    if (!card) return NextResponse.json({ error: "カードが見つかりません" }, { status: 404 });
    const instruction = await makeFix(card, String(feedback || ""));
    await requestFix(card.repo, card.number, instruction, card.pr);
    return NextResponse.json({ ok: true, instruction });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
