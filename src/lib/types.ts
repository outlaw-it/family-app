export type ProviderId = "local" | "anthropic" | "openai" | "azure";

export interface Member {
  id: number;
  name: string;
  avatar: string;
}

export interface Persona {
  id: number;
  name: string;
  avatar: string;
  system_prompt: string;
}

export interface Space {
  id: number;
  type: "family" | "personal";
  owner_member_id: number | null;
}

export interface Memory {
  id: number;
  space_id: number;
  author_member_id: number | null;
  title: string;
  body: string;
  tags: string;
  created_at: string;
  // joined / derived fields
  author_name?: string | null;
  space_type?: "family" | "personal";
}

export interface Settings {
  provider: ProviderId;
  model: string;
  base_url: string;
}

export type SpaceScope = "family" | "personal";

// --- conversation history (shared between server + client) ---
export interface ConversationListItem {
  id: number;
  created_at: string;
  persona_id: number | null;
  persona_name: string | null;
  space_type: "family" | "personal" | null;
  title: string; // first user message, or "New chat"
}

export interface ConversationMessage {
  id: number;
  role: "system" | "user" | "assistant";
  content: string;
  model_used: string | null;
  created_at: string;
}
