import { NextResponse } from "next/server";
import { currentMemberId } from "@/lib/current";
import { getConversation } from "@/lib/conversations";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const memberId = await currentMemberId(req);
  const { id } = await params;
  const conv = await getConversation(memberId, parseInt(id, 10));
  // 404 both when missing AND when it isn't the member's — don't leak existence.
  if (!conv) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(conv);
}
