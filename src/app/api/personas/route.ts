import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { Persona } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const sql = await db();
  const personas = await sql<Persona[]>`SELECT * FROM personas ORDER BY id`;
  return NextResponse.json(personas);
}

export async function POST(req: Request) {
  const { name, avatar, system_prompt } = await req.json();
  if (!name || !system_prompt) {
    return NextResponse.json({ error: "name and system_prompt are required" }, { status: 400 });
  }
  const sql = await db();
  const [persona] = await sql<Persona[]>`
    INSERT INTO personas (name, avatar, system_prompt)
    VALUES (${String(name).trim()}, ${String(avatar || "🤖")}, ${String(system_prompt).trim()})
    RETURNING *`;
  return NextResponse.json(persona, { status: 201 });
}
