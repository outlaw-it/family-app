import type { ProviderId } from "./types";

// ---------------------------------------------------------------------------
// One provider abstraction for every model call.
//
//   chat({ provider, model, baseUrl, apiKey, system, messages })
//
// To add a new provider: add an entry to PROVIDERS (for the UI) and a `case`
// in the switch inside chat(). That's the whole change.
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  provider: ProviderId;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  system: string;
  messages: ChatMessage[];
}

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  /** Whether this provider needs an API key (from .env). */
  needsKey: boolean;
  /** Env var the server reads the key from. */
  envKey?: string;
  /** Suggested model names for the picker. */
  models: string[];
  defaultModel: string;
  defaultBaseUrl?: string;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  local: {
    id: "local",
    label: "Local (Ollama / LM Studio)",
    needsKey: false,
    models: ["llama3.1", "llama3.2", "qwen2.5", "mistral", "phi3"],
    // Defaults can be overridden in .env so you can point at a box on your network
    // (e.g. LM Studio on another machine) without touching the UI.
    defaultModel: process.env.LOCAL_MODEL || "llama3.1",
    defaultBaseUrl: process.env.LOCAL_BASE_URL || "http://localhost:11434/v1",
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic Claude",
    needsKey: true,
    envKey: "ANTHROPIC_API_KEY",
    models: ["claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-8"],
    defaultModel: "claude-haiku-4-5-20251001",
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    needsKey: true,
    envKey: "OPENAI_API_KEY",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"],
    defaultModel: "gpt-4o-mini",
  },
  azure: {
    id: "azure",
    label: "Azure OpenAI",
    needsKey: true,
    envKey: "AZURE_OPENAI_API_KEY",
    // The Azure model name is your DEPLOYMENT name. Endpoint + deployment come from
    // .env (AZURE_OPENAI_BASE_URL / AZURE_OPENAI_MODEL) so nothing is hardcoded.
    models: [process.env.AZURE_OPENAI_MODEL || "gpt-5.5"],
    defaultModel: process.env.AZURE_OPENAI_MODEL || "gpt-5.5",
    defaultBaseUrl: process.env.AZURE_OPENAI_BASE_URL || "",
  },
};

/** Resolve the API key for a provider from the server environment. */
export function keyForProvider(provider: ProviderId): string | undefined {
  const info = PROVIDERS[provider];
  if (!info.needsKey || !info.envKey) return undefined;
  return process.env[info.envKey];
}

export class ProviderError extends Error {
  constructor(message: string, readonly status = 500) {
    super(message);
  }
}

export async function chat(req: ChatRequest): Promise<string> {
  switch (req.provider) {
    case "local":
    case "openai":
    case "azure":
      // All three speak the OpenAI /chat/completions shape. Azure differs only in
      // its auth header + api-version, handled inside openAiCompatibleChat.
      return openAiCompatibleChat(req);
    case "anthropic":
      return anthropicChat(req);
    default:
      throw new ProviderError(`Unknown provider: ${req.provider}`, 400);
  }
}

// Azure authenticates an API key via the `api-key` header (Bearer is for Entra ID
// tokens only), and its v1 surface takes an api-version query param.
function authHeaders(provider: ProviderId, apiKey?: string): Record<string, string> {
  if (!apiKey) return {};
  return provider === "azure" ? { "api-key": apiKey } : { Authorization: `Bearer ${apiKey}` };
}

function withApiVersion(provider: ProviderId, url: string): string {
  return provider === "azure" ? `${url}?api-version=preview` : url;
}

/**
 * Ask a provider which models it currently has available.
 * For local / OpenAI this is the OpenAI-compatible GET /v1/models (LM Studio &
 * Ollama both support it). For Anthropic it's GET /v1/models.
 * Returns a sorted list of model ids.
 */
export async function listModels(
  provider: ProviderId,
  baseUrl: string | undefined,
  apiKey: string | undefined
): Promise<string[]> {
  if (provider === "anthropic") {
    if (!apiKey) throw new ProviderError("Missing ANTHROPIC_API_KEY in .env.", 400);
    const res = await fetchOrThrow("https://api.anthropic.com/v1/models", {
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    });
    const data = (await res.json()) as any;
    return ((data?.data ?? []) as Array<{ id: string }>).map((m) => m.id).sort();
  }

  // local + openai + azure → OpenAI-compatible GET /v1/models
  const base = normalizeOpenAiBase(
    baseUrl?.trim() || (provider === "openai" ? "https://api.openai.com/v1" : "http://localhost:11434/v1")
  );
  const res = await fetchOrThrow(withApiVersion(provider, `${base}/models`), {
    headers: authHeaders(provider, apiKey),
  });
  const data = (await res.json()) as any;
  return ((data?.data ?? []) as Array<{ id: string }>)
    .map((m) => m.id)
    .filter(Boolean)
    .sort();
}

async function fetchOrThrow(url: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e: any) {
    throw new ProviderError(
      `Could not reach ${url}. Is the server running and reachable on your network? (${
        e?.message ?? "network error"
      })`,
      502
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ProviderError(`Model list error (${res.status}): ${text.slice(0, 300)}`, res.status);
  }
  return res;
}

// Normalise an OpenAI-compatible base URL. Servers like Ollama and LM Studio mount
// the API under /v1, but their UI shows just host:port (e.g. http://192.168.10.214:1234);
// Azure's endpoint ends in /openai/v1 (and is sometimes pasted with /responses on the end).
// We strip any trailing endpoint path and ensure the base ends in a /vN segment.
function normalizeOpenAiBase(url: string): string {
  let u = url.trim().replace(/\?.*$/, "").replace(/\/+$/, "");
  // tolerate someone pasting a full endpoint URL
  u = u.replace(/\/(chat\/completions|responses|completions|models)$/i, "");
  if (!/\/v\d+$/.test(u)) u += "/v1";
  return u;
}

// --- OpenAI-compatible (covers OpenAI cloud + Ollama + LM Studio + Azure OpenAI) ---
async function openAiCompatibleChat(req: ChatRequest): Promise<string> {
  const rawBase =
    req.baseUrl?.trim() ||
    (req.provider === "openai" ? "https://api.openai.com/v1" : "http://localhost:11434/v1");
  const baseUrl = normalizeOpenAiBase(rawBase);

  if (req.provider === "azure" && !req.apiKey) {
    throw new ProviderError("Missing AZURE_OPENAI_API_KEY in .env. Add it and restart the app.", 400);
  }

  const messages = [
    { role: "system", content: req.system },
    ...req.messages,
  ];

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...authHeaders(req.provider, req.apiKey),
  };

  const endpoint = withApiVersion(req.provider, `${baseUrl}/chat/completions`);

  const post = (includeTemperature: boolean) =>
    fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: req.model,
        messages,
        ...(includeTemperature ? { temperature: 0.4 } : {}),
      }),
    });

  let res: Response;
  try {
    res = await post(true);
  } catch (e: any) {
    throw new ProviderError(
      `Could not reach ${baseUrl}. ${
        req.provider === "local"
          ? "Is your local model server (Ollama / LM Studio) running?"
          : e?.message ?? "Network error"
      }`,
      502
    );
  }

  if (!res.ok) {
    let text = await res.text().catch(() => "");
    // Some models (e.g. OpenAI reasoning models) only allow the default
    // temperature. Retry once without it rather than failing the request.
    if (res.status === 400 && /temperature/i.test(text)) {
      try {
        res = await post(false);
      } catch (e: any) {
        throw new ProviderError(e?.message ?? "Network error", 502);
      }
      if (!res.ok) text = await res.text().catch(() => "");
    }

    if (!res.ok) {
      throw new ProviderError(
        `Model API error (${res.status}): ${text.slice(0, 400)}`,
        res.status
      );
    }
  }

  const data = (await res.json()) as any;
  return data?.choices?.[0]?.message?.content ?? "(no response)";
}

// --- Anthropic Claude -------------------------------------------------------
async function anthropicChat(req: ChatRequest): Promise<string> {
  if (!req.apiKey) {
    throw new ProviderError(
      "Missing ANTHROPIC_API_KEY. Add it to your .env file and restart the app.",
      400
    );
  }

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": req.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: req.model,
        max_tokens: 1024,
        system: req.system,
        messages: req.messages,
      }),
    });
  } catch (e: any) {
    throw new ProviderError(`Could not reach Anthropic API: ${e?.message ?? "network error"}`, 502);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ProviderError(
      `Anthropic API error (${res.status}): ${text.slice(0, 400)}`,
      res.status
    );
  }

  const data = (await res.json()) as any;
  const parts = (data?.content ?? []) as Array<{ type: string; text?: string }>;
  return parts.filter((p) => p.type === "text").map((p) => p.text).join("") || "(no response)";
}
