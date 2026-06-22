"use client";

import type { ConversationListItem } from "@/lib/types";

interface Props {
  conversations: ConversationListItem[];
  activeId: number | null;
  onSelect: (item: ConversationListItem) => void;
  onNew: () => void;
}

// Format the stored "YYYY-MM-DD HH:MI:SS" timestamp as a short DD/MM label.
function shortDate(ts: string): string {
  const [date] = ts.split(" ");
  const [, m, d] = date.split("-");
  return d && m ? `${d}/${m}` : ts;
}

export default function ConversationList({ conversations, activeId, onSelect, onNew }: Props) {
  return (
    <aside className="flex h-full w-60 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-3">
        <button
          onClick={onNew}
          className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          + New chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {conversations.length === 0 && (
          <p className="px-2 py-3 text-center text-xs text-slate-400">No conversations yet.</p>
        )}
        <ul className="space-y-1">
          {conversations.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => onSelect(c)}
                className={`w-full rounded-lg px-2.5 py-2 text-left text-sm transition ${
                  c.id === activeId
                    ? "bg-brand-50 text-brand-800"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                <span className="block truncate font-medium">{c.title || "New chat"}</span>
                <span className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">
                  <span>{c.space_type === "personal" ? "🔒" : "👪"}</span>
                  {c.persona_name && <span className="truncate">{c.persona_name}</span>}
                  <span>·</span>
                  <span>{shortDate(c.created_at)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
