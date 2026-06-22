"use client";

import { useEffect, useRef, useState } from "react";
import { api, getClientMember } from "@/lib/client";
import type { ConversationMessage, Member, Memory, Persona, SpaceScope } from "@/lib/types";

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
  // which conversation to show — null means a fresh chat
  conversationId: number | null;
  // called with the ids of memories the assistant used, so the side panel can highlight them
  onRecall: (usedIds: number[]) => void;
  // called when chat saves a memory ("remember that ...") so the panel refreshes
  onMemorySaved: () => void;
  // called once, when sending in a fresh chat creates a new conversation
  onConversationStarted: (id: number) => void;
}

// Parse one SSE frame ("event: x\ndata: {...}") into its event name + JSON payload.
function parseEvent(chunk: string): { event: string; data: any } | null {
  let event = "message";
  let data = "";
  for (const line of chunk.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (!data) return null;
  try {
    return { event, data: JSON.parse(data) };
  } catch {
    return null;
  }
}

export default function Chat({
  member,
  persona,
  scope,
  conversationId,
  onRecall,
  onMemorySaved,
  onConversationStarted,
}: Props) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  // the conversation whose turns are currently in state — avoids reloading the
  // one we just created by sending.
  const loadedRef = useRef<number | null>(null);

  // Load (or clear) turns whenever the selected conversation changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (conversationId == null) {
        setTurns([]);
        loadedRef.current = null;
        onRecall([]);
        return;
      }
      if (loadedRef.current === conversationId) return; // already showing it
      try {
        const conv = await api<{ messages: ConversationMessage[] }>(
          `/api/conversations/${conversationId}`
        );
        if (cancelled) return;
        setTurns(
          conv.messages
            .filter((m) => m.role !== "system")
            .map((m) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
              model: m.model_used ?? undefined,
            }))
        );
        loadedRef.current = conversationId;
        onRecall([]);
      } catch {
        if (!cancelled) setTurns([]);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, busy]);

  // Patch the most recent assistant turn (the one currently streaming in).
  function patchLastAssistant(patch: Partial<ChatTurn>) {
    setTurns((t) => {
      const copy = [...t];
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].role === "assistant") {
          copy[i] = { ...copy[i], ...patch };
          break;
        }
      }
      return copy;
    });
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const message = input.trim();
    if (!message || !persona || busy) return;

    const history = turns.map((t) => ({ role: t.role, content: t.content }));
    // append the user turn + an empty assistant turn to stream into
    setTurns((t) => [...t, { role: "user", content: message }, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);

    let assistant = "";
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const mid = getClientMember();
      if (mid) headers["x-member-id"] = String(mid);

      const res = await fetch("/api/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({ message, personaId: persona.id, scope, history, conversationId }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buf.indexOf("\n\n")) >= 0) {
          const ev = parseEvent(buf.slice(0, sep));
          buf = buf.slice(sep + 2);
          if (!ev) continue;
          if (ev.event === "recall") {
            patchLastAssistant({ used: ev.data.used, savedMemory: ev.data.savedMemory });
            onRecall((ev.data.used ?? []).map((m: Memory) => m.id));
            if (ev.data.savedMemory) onMemorySaved();
          } else if (ev.event === "delta") {
            assistant += ev.data.text;
            patchLastAssistant({ content: assistant });
          } else if (ev.event === "done") {
            patchLastAssistant({ model: ev.data.model });
            if (conversationId == null && ev.data.conversationId) {
              loadedRef.current = ev.data.conversationId; // we already hold these turns
              onConversationStarted(ev.data.conversationId);
            }
          } else if (ev.event === "error") {
            throw new Error(ev.data.message || "Something went wrong.");
          }
        }
      }
    } catch (err: any) {
      patchLastAssistant({
        content: (assistant ? assistant + "\n\n" : "") + `⚠️ ${err.message ?? "Something went wrong."}`,
      });
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
              {t.role === "assistant" && t.content === "" ? (
                <p className="text-slate-400">thinking…</p>
              ) : (
                <p className="whitespace-pre-wrap">{t.content}</p>
              )}

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

              {t.model && <p className="mt-1 text-[10px] text-slate-400">{t.model}</p>}
            </div>
          </div>
        ))}
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
