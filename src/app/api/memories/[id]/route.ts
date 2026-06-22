import { NextResponse } from "next/server";
import { currentMemberId } from "@/lib/current";
import { getMemory, updateMemory, deleteMemory } from "@/lib/memories";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const memberId = await currentMemberId(req);
  const { id } = await params;
  const memory = await getMemory(memberId, parseInt(id, 10));
  if (!memory) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(memory);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const memberId = await currentMemberId(req);
  const { id } = await params;
  const body = await req.json();
  const updated = await updateMemory(memberId, parseInt(id, 10), {
    title: body.title,
    body: body.body,
    tags: body.tags,
  });
  // Returns 404 both when missing AND when the member isn't allowed to see it.
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const memberId = await currentMemberId(req);
  const { id } = await params;
  const ok = await deleteMemory(memberId, parseInt(id, 10));
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
