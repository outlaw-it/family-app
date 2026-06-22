import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { Persona } from "@/lib/types";

export const runtime = "nodejs";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sql = await db();
  const [existing] = await sql<Persona[]>`SELECT * FROM personas WHERE id = ${id}`;
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { name, avatar, system_prompt } = await req.json();
  const [updated] = await sql<Persona[]>`
    UPDATE personas
    SET name = ${name ?? existing.name},
        avatar = ${avatar ?? existing.avatar},
        system_prompt = ${system_prompt ?? existing.system_prompt}
    WHERE id = ${id}
    RETURNING *`;
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sql = await db();
  const deleted = await sql`DELETE FROM personas WHERE id = ${id}`;
  if (deleted.count === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
