import { db } from "./db";
import type { Memory, SpaceScope } from "./types";

// ---------------------------------------------------------------------------
// Privacy is enforced HERE, in one place, for every read.
//
// The rule: a member may only ever see the Family space plus their OWN Personal
// space. They must never see another member's personal memories. Every query
// below derives the set of allowed space ids from the current member id, so
// there is no code path that returns a memory the current member can't see.
// ---------------------------------------------------------------------------

/** Space ids the given member is allowed to read: Family + their own Personal. */
async function allowedSpaceIds(memberId: number): Promise<number[]> {
  const sql = await db();
  const rows = await sql<{ id: number }[]>`
    SELECT id FROM spaces
    WHERE type = 'family'
       OR (type = 'personal' AND owner_member_id = ${memberId})`;
  return rows.map((r) => r.id);
}

/** Resolve the concrete space id for a given member + scope ('family' | 'personal'). */
export async function resolveSpaceId(memberId: number, scope: SpaceScope): Promise<number> {
  const sql = await db();
  if (scope === "family") {
    const [row] = await sql<{ id: number }[]>`
      SELECT id FROM spaces WHERE type = 'family' LIMIT 1`;
    if (!row) throw new Error("Family space missing");
    return row.id;
  }
  const [row] = await sql<{ id: number }[]>`
    SELECT id FROM spaces WHERE type = 'personal' AND owner_member_id = ${memberId} LIMIT 1`;
  if (!row) throw new Error("Personal space missing for member " + memberId);
  return row.id;
}

/** List memories the member can see, optionally restricted to one scope. */
export async function listMemories(memberId: number, scope?: SpaceScope): Promise<Memory[]> {
  const sql = await db();
  const allowed = await allowedSpaceIds(memberId);

  let targetIds = allowed;
  if (scope) {
    const scopeId = await resolveSpaceId(memberId, scope);
    // intersect with allowed — defensive, scopeId is always in allowed by construction
    targetIds = allowed.filter((id) => id === scopeId);
  }
  if (targetIds.length === 0) return [];

  return sql<Memory[]>`
    SELECT m.*, mem.name AS author_name, s.type AS space_type
    FROM memories m
    LEFT JOIN members mem ON mem.id = m.author_member_id
    JOIN spaces s ON s.id = m.space_id
    WHERE m.space_id = ANY(${targetIds})
    ORDER BY m.created_at DESC`;
}

/** Fetch one memory, but only if the member is allowed to see it. */
export async function getMemory(memberId: number, id: number): Promise<Memory | null> {
  const sql = await db();
  const allowed = await allowedSpaceIds(memberId);
  if (allowed.length === 0) return null;
  const [row] = await sql<Memory[]>`
    SELECT m.*, mem.name AS author_name, s.type AS space_type
    FROM memories m
    LEFT JOIN members mem ON mem.id = m.author_member_id
    JOIN spaces s ON s.id = m.space_id
    WHERE m.id = ${id} AND m.space_id = ANY(${allowed})`;
  return row ?? null;
}

export interface MemoryInput {
  title: string;
  body: string;
  tags: string;
  scope: SpaceScope;
}

/** Create a memory in the member's chosen scope (Family or own Personal). */
export async function createMemory(memberId: number, input: MemoryInput): Promise<Memory> {
  const sql = await db();
  const spaceId = await resolveSpaceId(memberId, input.scope);
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO memories (space_id, author_member_id, title, body, tags)
    VALUES (${spaceId}, ${memberId}, ${input.title.trim()}, ${input.body.trim()}, ${input.tags.trim()})
    RETURNING id`;
  return (await getMemory(memberId, row.id))!;
}

/** Update a memory the member is allowed to see. Returns null if not permitted. */
export async function updateMemory(
  memberId: number,
  id: number,
  fields: Partial<Pick<Memory, "title" | "body" | "tags">>
): Promise<Memory | null> {
  const existing = await getMemory(memberId, id);
  if (!existing) return null;
  const sql = await db();
  await sql`
    UPDATE memories SET title = ${fields.title ?? existing.title},
                        body = ${fields.body ?? existing.body},
                        tags = ${fields.tags ?? existing.tags}
    WHERE id = ${id}`;
  return getMemory(memberId, id);
}

/** Delete a memory the member is allowed to see. Returns true if deleted. */
export async function deleteMemory(memberId: number, id: number): Promise<boolean> {
  const existing = await getMemory(memberId, id);
  if (!existing) return false;
  const sql = await db();
  await sql`DELETE FROM memories WHERE id = ${id}`;
  return true;
}

// Common words that carry no recall signal — dropped before matching so a query
// like "what did we get Mum for her 60th" keys on "mum" + "60th", not "get"/"her".
const STOPWORDS = new Set([
  "the","and","for","you","your","our","was","are","that","this","with","who",
  "how","when","where","why","does","did","what","get","got","can","will","about",
  "from","has","have","had","them","they","she","him","his","her","its","but","not",
  "out","into","over","than","then","there","their","were","been","being","such",
]);

/**
 * Keyword recall over the active scope only.
 * Splits the query into meaningful words (>=3 chars, minus stopwords) and scores
 * each memory by how many distinct words appear — on word boundaries, so "get"
 * doesn't match inside "together". Privacy is preserved because we start from
 * listMemories(memberId, scope), which already excludes other members' personal
 * items. Returns the top `limit` matches (most relevant first).
 */
export async function searchMemories(
  memberId: number,
  scope: SpaceScope,
  query: string,
  limit = 5
): Promise<Memory[]> {
  const pool = await listMemories(memberId, scope);
  const words = Array.from(
    new Set(
      query
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
    )
  );
  if (words.length === 0) return [];

  const matchers = words.map(
    (w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i")
  );

  const scored = pool
    .map((m) => {
      const hay = `${m.title}\n${m.body}\n${m.tags}`;
      let score = 0;
      for (const re of matchers) if (re.test(hay)) score++;
      return { m, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((x) => x.m);
}
