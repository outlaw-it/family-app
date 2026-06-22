"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import type { Memory, SpaceScope } from "@/lib/types";

interface Props {
  memories: Memory[];
  scope: SpaceScope;
  highlightedIds: Set<number>;
  onChanged: () => void;
}

export default function MemoryPanel({ memories, scope, highlightedIds, onChanged }: Props) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);

  async function addMemory(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await api("/api/memories", {
        method: "POST",
        body: JSON.stringify({ title, body: bodyText, tags, scope }),
      });
      setTitle("");
      setBodyText("");
      setTags("");
      setAdding(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (!confirm("Delete this memory?")) return;
    await api(`/api/memories/${id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <aside className="flex h-full w-80 flex-col border-l border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">
            {scope === "family" ? "👪 Family memories" : "🔒 My personal memories"}
          </h2>
          <p className="text-xs text-slate-500">{memories.length} stored</p>
        </div>
        <button
          className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700"
          onClick={() => setAdding((v) => !v)}
        >
          {adding ? "Close" : "+ Add"}
        </button>
      </div>

      {adding && (
        <form onSubmit={addMemory} className="space-y-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <input
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
          <textarea
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
            placeholder="Body"
            rows={3}
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
          />
          <input
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
            placeholder="tags, comma, separated"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-brand-600 py-1 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? "Saving…" : `Save to ${scope === "family" ? "Family" : "Personal"}`}
          </button>
        </form>
      )}

      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {memories.length === 0 && (
          <p className="px-1 py-4 text-center text-sm text-slate-400">No memories yet.</p>
        )}
        {memories.map((m) => {
          const hot = highlightedIds.has(m.id);
          return (
            <div
              key={m.id}
              className={`group rounded-lg border p-3 text-sm transition ${
                hot ? "border-amber-400 bg-amber-50 ring-1 ring-amber-300" : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium leading-snug">{m.title}</h3>
                <button
                  className="opacity-0 transition group-hover:opacity-100 text-xs text-slate-400 hover:text-red-500"
                  onClick={() => remove(m.id)}
                  title="Delete"
                >
                  ✕
                </button>
              </div>
              {m.body && <p className="mt-1 text-slate-600">{m.body}</p>}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                {m.author_name && <span>by {m.author_name}</span>}
                {m.tags &&
                  m.tags
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean)
                    .map((t) => (
                      <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">
                        #{t}
                      </span>
                    ))}
                {hot && <span className="font-medium text-amber-600">★ used in last answer</span>}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
