import { NextResponse } from "next/server";
import { currentMemberId } from "@/lib/current";
import { listConversations } from "@/lib/conversations";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const memberId = await currentMemberId(req);
  // listConversations scopes to this member only.
  return NextResponse.json(await listConversations(memberId));
}
