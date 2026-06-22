import { NextResponse } from "next/server";
import { db, tx } from "@/lib/db";
import { currentMemberId } from "@/lib/current";
import { searchMemories, createMemory, resolveSpaceId } from "@/lib/memories";
import { chat, keyForProvider, ProviderError } from "@/lib/providers";
import type { ChatMessage } from "@/lib/providers";
import type { Memory, Persona, Settings, SpaceScope } from "@/lib/types";

export const runtime = "nodejs";

interface ChatBody {
  message: string;
  personaId: number;
  scope: SpaceScope;
  history?: ChatMessage[];
  conversationId?: number | null;
}

// Detect an explicit "remember that ..." instruction and pull out the note text.
function parseRememberCommand(message: string): string | null {
  const m = message.match(/^\s*(?:please\s+)?remember(?:\s+(?:that|this|to|:))?\s+(.+)/is);
  if (!m) return null;
  const note = m[1].trim();
  return note.length > 0 ? note : null;
}

function titleFromNote(note: string): string {
  const firstLine = note.split(/[.\n]/)[0].trim();
  return (firstLine.length > 70 ? firstLine.slice(0, 67) + "…" : firstLine) || "Note";
}

export async function POST(req: Request) {
  const sql = await db();
  const memberId = await currentMemberId(req);
  const body = (await req.json()) as ChatBody;
  const message = String(body.message ?? "").trim();
  if (!message) return NextResponse.json({ error: "message is required" }, { status: 400 });

  const scope: SpaceScope = body.scope === "personal" ? "personal" : "family";

  const [persona] = await sql<Persona[]>`SELECT * FROM personas WHERE id = ${body.personaId}`;
  if (!persona) return NextResponse.json({ error: "unknown persona" }, { status: 400 });

  const [settings] = await sql<Settings[]>`SELECT provider, model, base_url FROM settings WHERE id = 1`;
  if (!settings) return NextResponse.json({ error: "settings missing" }, { status: 500 });

  // 1) If the user asked us to remember something, save it into the active space.
  let savedMemory: Memory | null = null;
  const note = parseRememberCommand(message);
  if (note) {
    savedMemory = await createMemory(memberId, {
      title: titleFromNote(note),
      body: note,
      tags: "saved-from-chat",
      scope,
    });
  }

  // 2) Recall: find relevant memories in the active space (privacy-scoped).
  const used = await searchMemories(memberId, scope, message, 5);

  // 3) Build the system prompt: persona + recalled context.
  const spaceLabel = scope === "family" ? "the shared Family space" : "your own Personal space";
  let system = persona.system_prompt + "\n\n";
  system += `You are helping a member of the household. You are currently working from ${spaceLabel}.`;
  if (used.length > 0) {
    system +=
      "\n\nHere are stored memories that may be relevant to the question. " +
      "Use them to answer when appropriate, and prefer them over guessing:\n\n";
    for (const m of used) {
      system += `- [${m.title}] ${m.body}${m.tags ? ` (tags: ${m.tags})` : ""}\n`;
    }
    system +=
      "\nIf you used one of these memories, you may refer to it naturally. " +
      "If none are relevant, just answer normally.";
  } else {
    system +=
      "\n\nThere are no stored memories matching this question. " +
      "Answer normally, and if the user is asking about something the family would have recorded, you can say you don't have a memory of it.";
  }
  if (savedMemory) {
    system += `\n\nNOTE: You have just saved a new memory titled "${savedMemory.title}" into ${spaceLabel}. Confirm to the user that you've remembered it.`;
  }

  // 4) Call the model through the single provider abstraction.
  const history = Array.isArray(body.history) ? body.history.slice(-10) : [];
  const messages: ChatMessage[] = [...history, { role: "user", content: message }];

  let reply: string;
  try {
    reply = await chat({
      provider: settings.provider,
      model: settings.model,
      baseUrl: settings.base_url,
      apiKey: keyForProvider(settings.provider),
      system,
      messages,
    });
  } catch (e) {
    const err = e as ProviderError;
    return NextResponse.json(
      { error: err.message ?? "Model call failed", provider: settings.provider },
      { status: err.status ?? 500 }
    );
  }

  // 5) Persist the conversation + messages.
  const existingConversationId = body.conversationId ?? null;
  // resolveSpaceId is read outside the tx (separate pooled query) — fine.
  const spaceId = existingConversationId ? null : await resolveSpaceId(memberId, scope);
  const modelUsed = `${settings.provider}:${settings.model}`;
  const conversationId = await tx(async (sql) => {
    let cid = existingConversationId;
    if (!cid) {
      const [c] = await sql<{ id: number }[]>`
        INSERT INTO conversations (member_id, persona_id, space_id)
        VALUES (${memberId}, ${persona.id}, ${spaceId})
        RETURNING id`;
      cid = c.id;
    }
    await sql`INSERT INTO messages (conversation_id, role, content, model_used)
              VALUES (${cid}, 'user', ${message}, ${null})`;
    await sql`INSERT INTO messages (conversation_id, role, content, model_used)
              VALUES (${cid}, 'assistant', ${reply}, ${modelUsed})`;
    return cid;
  });

  return NextResponse.json({
    reply,
    model: `${settings.provider}:${settings.model}`,
    used, // memories used for recall — surfaced in the UI
    savedMemory, // non-null when a "remember that ..." note was stored
    conversationId,
  });
}
