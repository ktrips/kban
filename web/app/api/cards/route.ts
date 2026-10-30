import { NextResponse } from "next/server";
import { createCard, listCards, projects } from "@/lib/github";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ projects, cards: await listCards() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { repo, title, target } = await req.json();
    if (!repo || !title) return NextResponse.json({ error: "repo と title が必要です" }, { status: 400 });
    const p = projects.find((x) => x.repo === repo);
    const number = await createCard(repo, String(title).slice(0, 120), String(title), target || p?.target || "web");
    return NextResponse.json({ number });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
