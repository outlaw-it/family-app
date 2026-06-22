"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import type { Member, Memory, Persona, SpaceScope } from "@/lib/types";

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  used?: Memory[];
  savedMemory?: Memory | null;
  model?: string;
}

interface Props {
  member: Member | null;
  persona: Persona | null;
  scope: SpaceScope;
  // called with the ids of memories the assistant used, so the side panel can highlight them
  onRecall: (usedIds: number[]) => void;
  // called when chat saves a memory ("remember that ...") so the panel refreshes
  onMemorySaved: () => void;
}

export default function Chat({ member, persona, scope, onRecall, onMemorySaved }: Props) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Reset the conversation when who/where changes — a new context, a new chat.
  useEffect(() => {
    setTurns([]);
    setConversationId(null);
    onRecall([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.id, scope]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, busy]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const message = input.trim();
    if (!message || !persona) return;

    const history = turns.map((t) => ({ role: t.role, content: t.content }));
    setTurns((t) => [...t, { role: "user", content: message }]);
    setInput("");
    setBusy(true);

    try {
      const res = await api<{
        reply: string;
        model: string;
        used: Memory[];
        savedMemory: Memory | null;
        conversationId: number;
      }>("/api/chat", {
        method: "POST",
        body: JSON.stringify({ message, personaId: persona.id, scope, history, conversationId }),
      });
      setConversationId(res.conversationId);
      setTurns((t) => [
        ...t,
        {
          role: "assistant",
          content: res.reply,
          used: res.used,
          savedMemory: res.savedMemory,
          model: res.model,
        },
      ]);
      onRecall((res.used ?? []).map((m) => m.id));
      if (res.savedMemory) onMemorySaved();
    } catch (err: any) {
      setTurns((t) => [
        ...t,
        { role: "assistant", content: `⚠️ ${err.message ?? "Something went wrong."}` },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-1 flex-col bg-slate-50">
      {/* context strip */}
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 text-sm text-slate-500">
        <span className="text-lg">{persona?.avatar}</span>
        <span className="font-medium text-slate-700">{persona?.name}</span>
        <span>·</span>
        <span>
          {member?.avatar} {member?.name}
        </span>
        <span>·</span>
        <span>{scope === "family" ? "👪 Family space" : "🔒 Personal space"}</span>
      </div>

      {/* messages */}
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-6">
        {turns.length === 0 && (
          <div className="mx-auto max-w-md rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center text-sm text-slate-500">
            <p className="font-medium text-slate-700">Ask {persona?.name} anything.</p>
            <p className="mt-1">
              Try: <span className="italic">"What did we get Mum for her 60th?"</span>
            </p>
            <p className="mt-1">
              Or save a note: <span className="italic">"Remember that the spare key is under the pot."</span>
            </p>
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i} className={t.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                t.role === "user"
                  ? "bg-brand-600 text-white"
                  : "border border-slate-200 bg-white text-slate-800"
              }`}
            >
              <p className="whitespace-pre-wrap">{t.content}</p>

              {t.savedMemory && (
                <div className="mt-2 rounded-lg bg-green-50 px-2.5 py-1.5 text-xs text-green-700">
                  💾 Saved memory: <span className="font-medium">{t.savedMemory.title}</span>
                </div>
              )}

              {t.role === "assistant" && t.used && t.used.length > 0 && (
                <div className="mt-2 border-t border-slate-100 pt-2">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-600">
                    ★ Recalled from {scope === "family" ? "Family" : "Personal"} space
                  </p>
                  <ul className="space-y-0.5">
                    {t.used.map((m) => (
                      <li key={m.id} className="text-xs text-slate-500">
                        • {m.title}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {t.model && (
                <p className="mt-1 text-[10px] text-slate-400">{t.model}</p>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-400 shadow-sm">
              thinking…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* composer */}
      <form onSubmit={send} className="flex gap-2 border-t border-slate-200 bg-white px-4 py-3">
        <input
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          placeholder={`Message ${persona?.name ?? "the assistant"}…`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
