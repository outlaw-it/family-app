import { NextResponse } from "next/server";
import { db, tx } from "@/lib/db";
import type { Member } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const sql = await db();
  const members = await sql<Member[]>`SELECT * FROM members ORDER BY id`;
  return NextResponse.json(members);
}

export async function POST(req: Request) {
  const { name, avatar } = await req.json();
  if (!name || !String(name).trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const member = await tx(async (sql) => {
    const [m] = await sql<Member[]>`
      INSERT INTO members (name, avatar)
      VALUES (${String(name).trim()}, ${String(avatar || "🙂")})
      RETURNING *`;
    // every new member gets their own personal space
    await sql`INSERT INTO spaces (type, owner_member_id) VALUES ('personal', ${m.id})`;
    return m;
  });
  return NextResponse.json(member, { status: 201 });
}
