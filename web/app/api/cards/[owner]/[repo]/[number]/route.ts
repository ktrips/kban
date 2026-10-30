import { NextResponse } from "next/server";
import { updateCard } from "@/lib/github";
import { isStage } from "@/lib/stages";

type Params = { params: Promise<{ owner: string; repo: string; number: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const { owner, repo, number } = await params;
  try {
    const b = await req.json();
    if (b.stage !== undefined && !isStage(b.stage)) return NextResponse.json({ error: "不明な工程です" }, { status: 400 });
    await updateCard(`${owner}/${repo}`, Number(number), {
      title: b.title,
      stage: b.stage,
      priority: b.priority,
      idea: b.idea,
      spec: b.spec,
      prompt: b.prompt,
      criteria: Array.isArray(b.criteria) ? b.criteria : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
