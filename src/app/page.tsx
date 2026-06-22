"use client";

import { useCallback, useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
import Chat from "@/components/Chat";
import MemoryPanel from "@/components/MemoryPanel";
import { api, setClientMember } from "@/lib/client";
import type { Member, Memory, Persona, Settings, SpaceScope } from "@/lib/types";

const MEMBER_KEY = "familybrain.memberId";

export default function Home() {
  const [members, setMembers] = useState<Member[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [memberId, setMemberId] = useState<number>(0);
  const [personaId, setPersonaId] = useState<number>(0);
  const [scope, setScope] = useState<SpaceScope>("family");
  const [memories, setMemories] = useState<Memory[]>([]);
  const [highlightedIds, setHighlightedIds] = useState<Set<number>>(new Set());
  const [loaded, setLoaded] = useState(false);

  // initial load
  useEffect(() => {
    (async () => {
      const [ms, ps, s] = await Promise.all([
        api<Member[]>("/api/members"),
        api<Persona[]>("/api/personas"),
        api<{ settings: Settings }>("/api/settings"),
      ]);
      setMembers(ms);
      setPersonas(ps);
      setSettings(s.settings);

      const stored = Number(localStorage.getItem(MEMBER_KEY));
      const initialMember = ms.find((m) => m.id === stored)?.id ?? ms[0]?.id ?? 0;
      setMemberId(initialMember);
      setClientMember(initialMember);
      setPersonaId(ps[0]?.id ?? 0);
      setLoaded(true);
    })();
  }, []);

  const refreshMemories = useCallback(async () => {
    if (!memberId) return;
    const list = await api<Memory[]>(`/api/memories?scope=${scope}`);
    setMemories(list);
  }, [memberId, scope]);

  useEffect(() => {
    if (loaded) refreshMemories();
  }, [loaded, refreshMemories]);

  function onMemberChange(id: number) {
    setMemberId(id);
    setClientMember(id);
    localStorage.setItem(MEMBER_KEY, String(id));
    setHighlightedIds(new Set());
  }

  const currentMember = members.find((m) => m.id === memberId) ?? null;
  const currentPersona = personas.find((p) => p.id === personaId) ?? null;

  if (!loaded) {
    return (
      <main className="flex h-screen items-center justify-center text-slate-400">Loading…</main>
    );
  }

  return (
    <main className="flex h-screen flex-col">
      <TopBar
        members={members}
        personas={personas}
        currentMember={currentMember}
        currentPersona={currentPersona}
        scope={scope}
        settings={settings}
        onMemberChange={onMemberChange}
        onPersonaChange={setPersonaId}
        onScopeChange={(s) => {
          setScope(s);
          setHighlightedIds(new Set());
        }}
      />
      <div className="flex min-h-0 flex-1">
        <Chat
          member={currentMember}
          persona={currentPersona}
          scope={scope}
          onRecall={(ids) => setHighlightedIds(new Set(ids))}
          onMemorySaved={refreshMemories}
        />
        <MemoryPanel
          memories={memories}
          scope={scope}
          highlightedIds={highlightedIds}
          onChanged={refreshMemories}
        />
      </div>
    </main>
  );
}
