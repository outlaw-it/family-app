"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import type { Persona, ProviderId, Settings } from "@/lib/types";
import type { ProviderInfo } from "@/lib/providers";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [providers, setProviders] = useState<Record<ProviderId, ProviderInfo> | null>(null);
  const [keyStatus, setKeyStatus] = useState<Record<string, boolean>>({});
  const [models, setModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelError, setModelError] = useState("");
  const [savedMsg, setSavedMsg] = useState("");

  useEffect(() => {
    api<{ settings: Settings; providers: Record<ProviderId, ProviderInfo>; keyStatus: Record<string, boolean> }>(
      "/api/settings"
    ).then((d) => {
      setSettings(d.settings);
      setDraft(d.settings);
      setProviders(d.providers);
      setKeyStatus(d.keyStatus);
      // discover models for the active provider on load
      fetchModels(d.settings.provider, d.settings.base_url);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchModels(provider: ProviderId, baseUrl: string) {
    setFetchingModels(true);
    setModelError("");
    try {
      const q = new URLSearchParams({ provider, base_url: baseUrl ?? "" });
      const res = await api<{ models: string[] }>(`/api/models?${q.toString()}`);
      setModels(res.models ?? []);
      if (!res.models?.length) setModelError("No models returned by the server.");
    } catch (e: any) {
      setModels([]);
      setModelError(e.message ?? "Could not reach the server.");
    } finally {
      setFetchingModels(false);
    }
  }

  function pickProvider(id: ProviderId) {
    if (!providers) return;
    const info = providers[id];
    const next: Settings = { provider: id, model: info.defaultModel, base_url: info.defaultBaseUrl ?? "" };
    setDraft(next);
    setModels([]);
    fetchModels(id, next.base_url);
  }

  async function save() {
    if (!draft) return;
    await api("/api/settings", { method: "PUT", body: JSON.stringify(draft) });
    setSettings(draft);
    setSavedMsg("Saved ✓");
    setTimeout(() => setSavedMsg(""), 2000);
  }

  if (!settings || !draft || !providers) {
    return <main className="flex h-screen items-center justify-center text-slate-400">Loading…</main>;
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  // dropdown options: discovered models if we have them, else the built-in suggestions.
  // Always include the current draft model so the selection is never lost.
  const baseOptions = models.length ? models : providers[draft.provider].models;
  const options = Array.from(
    new Set(
      draft.model && !baseOptions.includes(draft.model)
        ? [draft.model, ...baseOptions]
        : baseOptions
    )
  );

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <Link href="/" className="text-sm font-medium text-brand-600 hover:underline">
          ← Back to chat
        </Link>
      </div>

      {/* ---- Provider & model ---- */}
      <section className="mb-8 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-1 text-lg font-semibold">AI provider & model</h2>
        <p className="mb-4 text-sm text-slate-500">
          Keys are read from your local <code className="rounded bg-slate-100 px-1">.env</code> file and
          never leave this machine.
        </p>

        <div className="space-y-3">
          {Object.values(providers).map((p) => {
            const active = p.id === draft.provider;
            const hasKey = keyStatus[p.id];
            return (
              <label
                key={p.id}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                  active ? "border-brand-500 bg-brand-50" : "border-slate-200"
                }`}
              >
                <input
                  type="radio"
                  name="provider"
                  className="mt-1"
                  checked={active}
                  onChange={() => pickProvider(p.id)}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.label}</span>
                    {p.needsKey ? (
                      hasKey ? (
                        <span className="rounded bg-green-100 px-1.5 py-0.5 text-[11px] font-medium text-green-700">
                          key found
                        </span>
                      ) : (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                          no key in .env ({p.envKey})
                        </span>
                      )
                    ) : (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
                        no key needed
                      </span>
                    )}
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        {/* Base URL (for providers with a configurable endpoint) + a button to query its models */}
        {(draft.provider === "local" || draft.provider === "azure") && (
          <label className="mt-5 block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Base URL</span>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder={
                  draft.provider === "azure"
                    ? "https://your-resource.services.ai.azure.com/openai/v1"
                    : "http://192.168.10.214:1234"
                }
                value={draft.base_url}
                onChange={(e) => setDraft({ ...draft, base_url: e.target.value })}
              />
              <button
                type="button"
                onClick={() => fetchModels(draft.provider, draft.base_url)}
                disabled={fetchingModels}
                className="whitespace-nowrap rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {fetchingModels ? "Checking…" : "Fetch models"}
              </button>
            </div>
            <span className="mt-1 block text-xs text-slate-400">
              {draft.provider === "azure"
                ? "Your Azure endpoint ending in /openai/v1. The api-key + api-version are handled for you; the model is your deployment name."
                : "Enter the address LM Studio shows as “Reachable at” — the /v1 is added automatically."}
            </span>
          </label>
        )}

        {/* Model dropdown */}
        <div className="mt-5">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Model</span>
            <button
              type="button"
              onClick={() => fetchModels(draft.provider, draft.base_url)}
              disabled={fetchingModels}
              className="text-xs font-medium text-brand-600 hover:underline disabled:opacity-50"
            >
              {fetchingModels ? "Refreshing…" : "↻ Refresh"}
            </button>
          </div>
          <select
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            value={draft.model}
            onChange={(e) => setDraft({ ...draft, model: e.target.value })}
          >
            {options.length === 0 && <option value="">(no models found)</option>}
            {options.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs">
            {modelError ? (
              <span className="text-amber-600">{modelError} Showing suggested defaults.</span>
            ) : models.length ? (
              <span className="text-green-600">
                {models.length} model{models.length === 1 ? "" : "s"} found on the server.
              </span>
            ) : (
              <span className="text-slate-400">Showing suggested models.</span>
            )}
          </span>
        </div>

        {/* Save */}
        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={!dirty}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40"
          >
            Save
          </button>
          {savedMsg && <span className="text-sm font-medium text-green-600">{savedMsg}</span>}
          {dirty && !savedMsg && <span className="text-sm text-slate-400">Unsaved changes</span>}
          <span className="ml-auto text-xs text-slate-400">
            Active: <span className="font-medium text-slate-600">{settings.provider} · {settings.model}</span>
          </span>
        </div>
      </section>

      <PersonaManager />
    </main>
  );
}

// ----------------------------------------------------------------------------
function PersonaManager() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [editing, setEditing] = useState<Persona | null>(null);
  const [draft, setDraft] = useState({ name: "", avatar: "🤖", system_prompt: "" });

  async function load() {
    setPersonas(await api<Persona[]>("/api/personas"));
  }
  useEffect(() => {
    load();
  }, []);

  function startNew() {
    setEditing({ id: 0, name: "", avatar: "🤖", system_prompt: "" });
    setDraft({ name: "", avatar: "🤖", system_prompt: "" });
  }
  function startEdit(p: Persona) {
    setEditing(p);
    setDraft({ name: p.name, avatar: p.avatar, system_prompt: p.system_prompt });
  }

  async function saveDraft(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    if (editing.id === 0) {
      await api("/api/personas", { method: "POST", body: JSON.stringify(draft) });
    } else {
      await api(`/api/personas/${editing.id}`, { method: "PUT", body: JSON.stringify(draft) });
    }
    setEditing(null);
    load();
  }

  async function remove(id: number) {
    if (!confirm("Delete this persona?")) return;
    await api(`/api/personas/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Personas</h2>
          <p className="text-sm text-slate-500">The assistant's character & system prompt.</p>
        </div>
        <button
          onClick={startNew}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          + New persona
        </button>
      </div>

      <div className="space-y-2">
        {personas.map((p) => (
          <div key={p.id} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
            <span className="text-2xl">{p.avatar}</span>
            <div className="flex-1">
              <p className="font-medium">{p.name}</p>
              <p className="line-clamp-2 text-xs text-slate-500">{p.system_prompt}</p>
            </div>
            <div className="flex gap-2 text-sm">
              <button onClick={() => startEdit(p)} className="text-brand-600 hover:underline">
                Edit
              </button>
              <button onClick={() => remove(p.id)} className="text-red-500 hover:underline">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <form onSubmit={saveDraft} className="mt-4 space-y-3 rounded-lg border border-brand-200 bg-brand-50 p-4">
          <h3 className="font-medium">{editing.id === 0 ? "New persona" : `Edit ${editing.name}`}</h3>
          <div className="flex gap-3">
            <label className="w-20">
              <span className="mb-1 block text-xs font-medium text-slate-600">Emoji</span>
              <input
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-center text-lg"
                value={draft.avatar}
                onChange={(e) => setDraft({ ...draft, avatar: e.target.value })}
              />
            </label>
            <label className="flex-1">
              <span className="mb-1 block text-xs font-medium text-slate-600">Name</span>
              <input
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                required
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">System prompt</span>
            <textarea
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              rows={4}
              value={draft.system_prompt}
              onChange={(e) => setDraft({ ...draft, system_prompt: e.target.value })}
              required
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
