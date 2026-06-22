import { db } from "./db";
import type { ConversationListItem, ConversationMessage } from "./types";

// ---------------------------------------------------------------------------
// Conversation history reads. A member only ever sees their OWN conversations:
// every query is scoped by member_id, so there is no path that returns another
// member's chat. (Conversations are owned by a single member; the space link is
// only about which memory space the chat drew on.) Mirrors the no-leak rule in
// memories.ts — a by-id miss returns null → 404, never 403.
// ---------------------------------------------------------------------------

/** List the given member's conversations, newest first, titled by first message. */
export async function listConversations(memberId: number): Promise<ConversationListItem[]> {
  const sql = await db();
  return sql<ConversationListItem[]>`
    SELECT c.id,
           c.created_at,
           c.persona_id,
           p.name AS persona_name,
           s.type AS space_type,
           COALESCE(
             (SELECT mm.content FROM messages mm
               WHERE mm.conversation_id = c.id AND mm.role = 'user'
               ORDER BY mm.id LIMIT 1),
             'New chat'
           ) AS title
    FROM conversations c
    LEFT JOIN personas p ON p.id = c.persona_id
    LEFT JOIN spaces s   ON s.id = c.space_id
    WHERE c.member_id = ${memberId}
    ORDER BY c.created_at DESC, c.id DESC`;
}

export interface ConversationDetail {
  id: number;
  persona_id: number | null;
  space_type: "family" | "personal" | null;
  messages: ConversationMessage[];
}

/** Fetch one conversation with its messages — only if it belongs to the member. */
export async function getConversation(
  memberId: number,
  id: number
): Promise<ConversationDetail | null> {
  const sql = await db();
  const [conv] = await sql<
    { id: number; persona_id: number | null; space_type: "family" | "personal" | null }[]
  >`
    SELECT c.id, c.persona_id, s.type AS space_type
    FROM conversations c
    LEFT JOIN spaces s ON s.id = c.space_id
    WHERE c.id = ${id} AND c.member_id = ${memberId}`;
  if (!conv) return null;

  const messages = await sql<ConversationMessage[]>`
    SELECT id, role, content, model_used, created_at
    FROM messages
    WHERE conversation_id = ${id}
    ORDER BY id`;

  return { ...conv, messages };
}
