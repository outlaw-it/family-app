"use client";

import Link from "next/link";
import type { Member, Persona, Settings, SpaceScope } from "@/lib/types";

interface Props {
  members: Member[];
  personas: Persona[];
  currentMember: Member | null;
  currentPersona: Persona | null;
  scope: SpaceScope;
  settings: Settings | null;
  onMemberChange: (id: number) => void;
  onPersonaChange: (id: number) => void;
  onScopeChange: (scope: SpaceScope) => void;
}

export default function TopBar({
  members,
  personas,
  currentMember,
  currentPersona,
  scope,
  settings,
  onMemberChange,
  onPersonaChange,
  onScopeChange,
}: Props) {
  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5 shadow-sm">
      <div className="flex items-center gap-2 pr-2">
        <span className="text-xl">🧠</span>
        <span className="text-lg font-semibold tracking-tight">Family Brain</span>
      </div>

      {/* I am [member] switcher */}
      <label className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1 text-sm">
        <span className="text-slate-500">I am</span>
        <select
          className="bg-transparent font-medium outline-none"
          value={currentMember?.id ?? ""}
          onChange={(e) => onMemberChange(Number(e.target.value))}
        >
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.avatar} {m.name}
            </option>
          ))}
        </select>
      </label>

      {/* Persona picker */}
      <label className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1 text-sm">
        <span className="text-slate-500">Persona</span>
        <select
          className="bg-transparent font-medium outline-none"
          value={currentPersona?.id ?? ""}
          onChange={(e) => onPersonaChange(Number(e.target.value))}
        >
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.avatar} {p.name}
            </option>
          ))}
        </select>
      </label>

      {/* Active-space toggle */}
      <div className="flex items-center overflow-hidden rounded-lg border border-slate-200 text-sm">
        <button
          className={`px-3 py-1 font-medium ${
            scope === "family" ? "bg-brand-600 text-white" : "bg-white text-slate-600"
          }`}
          onClick={() => onScopeChange("family")}
        >
          👪 Family
        </button>
        <button
          className={`px-3 py-1 font-medium ${
            scope === "personal" ? "bg-brand-600 text-white" : "bg-white text-slate-600"
          }`}
          onClick={() => onScopeChange("personal")}
        >
          🔒 My Personal
        </button>
      </div>

      <div className="ml-auto flex items-center gap-3">
        {/* Active model indicator */}
        <span className="hidden rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium text-white sm:inline">
          {settings ? `${settings.provider} · ${settings.model}` : "no model"}
        </span>
        <Link
          href="/settings"
          className="rounded-lg border border-slate-200 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          ⚙️ Settings
        </Link>
      </div>
    </header>
  );
}
