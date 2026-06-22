import { NextResponse } from "next/server";
import { currentMemberId } from "@/lib/current";
import { listMemories, createMemory } from "@/lib/memories";
import type { SpaceScope } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const memberId = await currentMemberId(req);
  const url = new URL(req.url);
  const scopeParam = url.searchParams.get("scope");
  const scope = scopeParam === "family" || scopeParam === "personal" ? scopeParam : undefined;
  // listMemories enforces the privacy rule for memberId.
  return NextResponse.json(await listMemories(memberId, scope));
}

export async function POST(req: Request) {
  const memberId = await currentMemberId(req);
  const body = await req.json();
  const scope: SpaceScope = body.scope === "personal" ? "personal" : "family";
  if (!body.title || !String(body.title).trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const memory = await createMemory(memberId, {
    title: String(body.title),
    body: String(body.body ?? ""),
    tags: String(body.tags ?? ""),
    scope,
  });
  return NextResponse.json(memory, { status: 201 });
}
