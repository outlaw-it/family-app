import { db } from "./db";
import type { Member } from "./types";

// There is no real auth in this demo. The browser sends the "current member"
// via the x-member-id header (set by the top-bar "I am [member]" switcher).
// Every route resolves it here, and all memory reads are scoped to it — so even
// without auth, you can only ever see the Family space plus your own Personal.
export async function currentMemberId(req: Request): Promise<number> {
  const raw = req.headers.get("x-member-id");
  const id = raw ? parseInt(raw, 10) : NaN;
  if (Number.isFinite(id)) return id;

  // Fall back to the first member so the app still works before a pick is made.
  const sql = await db();
  const [row] = await sql<{ id: number }[]>`SELECT id FROM members ORDER BY id LIMIT 1`;
  if (!row) throw new Error("No members exist");
  return row.id;
}

export async function requireMember(req: Request): Promise<Member> {
  const id = await currentMemberId(req);
  const sql = await db();
  const [m] = await sql<Member[]>`SELECT * FROM members WHERE id = ${id}`;
  if (!m) throw new Error("Unknown member");
  return m;
}
