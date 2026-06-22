"use client";

// Tiny fetch wrapper that attaches the "current member" header so the server can
// scope every read. The id is the one chosen in the "I am [member]" switcher.
let currentMemberId = 0;

export function setClientMember(id: number) {
  currentMemberId = id;
}

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (currentMemberId) headers["x-member-id"] = String(currentMemberId);

  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data && (data.error as string)) || `Request failed (${res.status})`);
  }
  return data as T;
}
