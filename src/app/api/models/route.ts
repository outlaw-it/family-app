import { NextResponse } from "next/server";
import { PROVIDERS, listModels, keyForProvider, ProviderError } from "@/lib/providers";
import type { ProviderId } from "@/lib/types";

export const runtime = "nodejs";

// Discover the models a provider currently has available.
// Called from Settings to populate the model dropdown — e.g. asks LM Studio at the
// configured IP which models are loaded.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const provider = (url.searchParams.get("provider") as ProviderId) ?? "local";
  if (!PROVIDERS[provider]) {
    return NextResponse.json({ error: "unknown provider" }, { status: 400 });
  }
  const baseUrl = url.searchParams.get("base_url") ?? undefined;

  try {
    const models = await listModels(provider, baseUrl, keyForProvider(provider));
    return NextResponse.json({ models });
  } catch (e) {
    const err = e as ProviderError;
    return NextResponse.json(
      { error: err.message ?? "Could not list models", models: [] },
      { status: err.status ?? 500 }
    );
  }
}
