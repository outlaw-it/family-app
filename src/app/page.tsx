"use client";

import { useCallback, useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
import Chat from "@/components/Chat";
import MemoryPanel from "@/components/MemoryPanel";
import ConversationList from "@/components/ConversationList";
import { api, setClientMember } from "@/lib/client";
import type {
  ConversationListItem,
  Member,
  Memory,
  Persona,
  Settings,
  SpaceScope,
} from "@/lib/types";

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
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
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

  const refreshConversations = useCallback(async () => {
    if (!memberId) return;
    setConversations(await api<ConversationListItem[]>("/api/conversations"));
  }, [memberId]);

  useEffect(() => {
    if (loaded) refreshMemories();
  }, [loaded, refreshMemories]);

  useEffect(() => {
    if (loaded) refreshConversations();
  }, [loaded, refreshConversations]);

  function onMemberChange(id: number) {
    setMemberId(id);
    setClientMember(id);
    localStorage.setItem(MEMBER_KEY, String(id));
    setHighlightedIds(new Set());
    setActiveConversationId(null); // a different member is a different context
  }

  function newChat() {
    setActiveConversationId(null);
    setHighlightedIds(new Set());
  }

  function selectConversation(item: ConversationListItem) {
    // Show the conversation in its original space + persona for continuity.
    if (item.space_type) setScope(item.space_type);
    if (item.persona_id) setPersonaId(item.persona_id);
    setActiveConversationId(item.id);
    setHighlightedIds(new Set());
  }

  function onConversationStarted(id: number) {
    setActiveConversationId(id);
    refreshConversations();
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
          newChat();
        }}
      />
      <div className="flex min-h-0 flex-1">
        <ConversationList
          conversations={conversations}
          activeId={activeConversationId}
          onSelect={selectConversation}
          onNew={newChat}
        />
        <Chat
          member={currentMember}
          persona={currentPersona}
          scope={scope}
          conversationId={activeConversationId}
          onRecall={(ids) => setHighlightedIds(new Set(ids))}
          onMemorySaved={refreshMemories}
          onConversationStarted={onConversationStarted}
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
