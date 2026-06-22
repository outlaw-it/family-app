import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PROVIDERS, keyForProvider } from "@/lib/providers";
import type { ProviderId, Settings } from "@/lib/types";

export const runtime = "nodejs";

async function readSettings(): Promise<Settings> {
  const sql = await db();
  const [row] = await sql<Settings[]>`SELECT provider, model, base_url FROM settings WHERE id = 1`;
  return row ?? { provider: "local", model: "llama3.1", base_url: "http://localhost:11434/v1" };
}

export async function GET() {
  const settings = await readSettings();
  // Report which providers have a key present in .env (booleans only — never the key itself).
  const keyStatus: Record<string, boolean> = {};
  for (const p of Object.values(PROVIDERS)) {
    keyStatus[p.id] = p.needsKey ? Boolean(keyForProvider(p.id)) : true;
  }
  return NextResponse.json({ settings, providers: PROVIDERS, keyStatus });
}

export async function PUT(req: Request) {
  const body = await req.json();
  const provider = (body.provider as ProviderId) ?? "local";
  if (!PROVIDERS[provider]) {
    return NextResponse.json({ error: "unknown provider" }, { status: 400 });
  }
  const model = String(body.model ?? PROVIDERS[provider].defaultModel);
  const baseUrl = String(body.base_url ?? PROVIDERS[provider].defaultBaseUrl ?? "");

  const sql = await db();
  await sql`UPDATE settings SET provider = ${provider}, model = ${model}, base_url = ${baseUrl} WHERE id = 1`;

  return NextResponse.json(await readSettings());
}
