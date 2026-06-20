"use client";
//
// The studio: a prompt + token panel on the left, a LIVE preview (Sandpack runs
// the generated component in a sandboxed iframe with Tailwind) + code on the
// right. Each generation is a version you can restore — AI edits regress, so
// cheap undo is what makes aggressive iteration safe.
import { useState } from "react";
import {
  SandpackProvider,
  SandpackLayout,
  SandpackCodeEditor,
  SandpackPreview,
} from "@codesandbox/sandpack-react";
import { defaultTokens, type Tokens } from "@/lib/tokens";
import { extractCode } from "@/lib/extract";

const VIEWPORTS = { desktop: "100%", tablet: "768px", mobile: "390px" } as const;
type Viewport = keyof typeof VIEWPORTS;

const STARTER = `import React from "react";

export default function App() {
  return (
    <main className="min-h-screen grid place-items-center bg-[#FAFAFA] text-[#0F172A] font-sans p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-5 h-12 w-12 rounded-2xl bg-[#10B981]" />
        <h1 className="text-3xl font-semibold tracking-tight">Describe a UI</h1>
        <p className="mt-2 text-[#64748B]">
          Type what you want on the left. Athene generates it, live, here — on-brand
          to your tokens.
        </p>
      </div>
    </main>
  );
}`;

const EXAMPLES = [
  "a pricing page with 3 tiers and a monthly/annual toggle",
  "a testimonial card with an avatar, quote, and name",
  "a hero section with a heading and a waitlist email signup",
  "a stats row: 4 KPI cards with a label, big number, and trend",
];

type Version = { prompt: string; code: string; model?: string };

export default function DesignStudio() {
  const [prompt, setPrompt] = useState("");
  const [code, setCode] = useState(STARTER);
  const [gen, setGen] = useState(0); // bumps on generation/restore → Sandpack remounts fresh
  const [tokens, setTokens] = useState<Tokens>(defaultTokens);
  const [history, setHistory] = useState<Version[]>([]);
  const [loading, setLoading] = useState(false);
  const [streamRaw, setStreamRaw] = useState(""); // live tokens while generating
  const [error, setError] = useState("");
  const [model, setModel] = useState("");
  const [copied, setCopied] = useState(false);
  const [viewport, setViewport] = useState<Viewport>("desktop");

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  function downloadCode() {
    const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "App.tsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  const applyCode = (c: string) => {
    setCode(c);
    setGen((g) => g + 1);
  };

  async function generate() {
    const p = prompt.trim();
    if (!p || loading) return;
    setLoading(true);
    setError("");
    setStreamRaw("");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // First prompt = a fresh component (replace the starter); later prompts
        // iterate on the current canvas.
        body: JSON.stringify({ prompt: p, currentCode: history.length ? code : undefined, tokens }),
      });
      if (!res.ok || !res.body) {
        let msg = `request failed (${res.status})`;
        try {
          msg = (await res.json()).error ?? msg;
        } catch {
          /* not JSON */
        }
        setError(msg);
        return;
      }
      const modelUsed = res.headers.get("x-athene-model") ?? "";
      setModel(modelUsed); // show it in the streaming header right away
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let raw = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        raw += dec.decode(value, { stream: true });
        setStreamRaw(raw);
      }
      const out = extractCode(raw);
      if (out) {
        setHistory((h) => [{ prompt: p, code: out, model: modelUsed }, ...h]);
        applyCode(out);
        setModel(modelUsed);
        setPrompt("");
      } else {
        setError("the model didn't return a usable component — try rephrasing");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setStreamRaw("");
    }
  }

  function setToken(k: keyof Tokens, v: string) {
    setTokens((t) => ({ ...t, [k]: v }));
  }

  return (
    <div className="flex h-dvh flex-col bg-[#FAFAFA] text-[#0F172A]">
      <header className="flex items-center justify-between border-b border-black/5 px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#10B981] text-sm text-white">A</span>
          <span className="font-semibold tracking-tight">Athene Design</span>
          <span className="ml-2 rounded-full bg-black/5 px-2 py-0.5 text-xs text-[#64748B]">free · prompt → UI</span>
        </div>
        <div className="flex items-center gap-2">
          {model && <span className="hidden text-xs text-[#64748B] sm:inline">generated by {model}</span>}
          <button
            onClick={copyCode}
            className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-[#0F172A] transition hover:bg-black/5"
          >
            {copied ? "Copied ✓" : "Copy code"}
          </button>
          <button
            onClick={downloadCode}
            className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-[#0F172A] transition hover:bg-black/5"
          >
            Download
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[380px_1fr]">
        {/* Left: prompt + tokens + history */}
        <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto border-r border-black/5 p-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-[#64748B]">Describe a change</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") generate();
              }}
              rows={4}
              placeholder="a pricing page with 3 tiers and a monthly/annual toggle"
              className="w-full resize-none rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-[#10B981]"
            />
            <button
              onClick={generate}
              disabled={loading || !prompt.trim()}
              className="mt-2 w-full rounded-xl bg-[#10B981] px-4 py-2.5 text-sm font-medium text-white transition hover:brightness-95 disabled:opacity-40"
            >
              {loading ? "Generating…" : history.length ? "Apply change" : "Generate"}
            </button>
            <p className="mt-1 text-[10px] text-[#94A3B8]">⌘/Ctrl+Enter to run</p>
            {error && <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-600">{error}</p>}
            {history.length === 0 && (
              <div className="mt-3">
                <div className="mb-1.5 text-[10px] uppercase tracking-wide text-[#94A3B8]">try</div>
                <div className="flex flex-wrap gap-1.5">
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      onClick={() => setPrompt(ex)}
                      className="rounded-full border border-black/10 bg-white px-2.5 py-1 text-left text-[11px] text-[#475569] transition hover:border-[#10B981] hover:text-[#0F172A]"
                    >
                      {ex.length > 32 ? ex.slice(0, 32) + "…" : ex}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="mb-2 text-xs font-medium text-[#64748B]">Design tokens (your brand)</div>
            <div className="space-y-2">
              {(["primary", "bg", "surface", "ink", "muted"] as (keyof Tokens)[]).map((k) => (
                <div key={k} className="flex items-center gap-2">
                  <input
                    type="color"
                    value={tokens[k]}
                    onChange={(e) => setToken(k, e.target.value)}
                    className="h-7 w-7 cursor-pointer rounded border border-black/10"
                    aria-label={k}
                  />
                  <span className="w-16 text-xs text-[#64748B]">{k}</span>
                  <input
                    value={tokens[k]}
                    onChange={(e) => setToken(k, e.target.value)}
                    className="flex-1 rounded-md border border-black/10 bg-white px-2 py-1 font-mono text-xs outline-none focus:border-[#10B981]"
                  />
                </div>
              ))}
              <div className="flex items-center gap-2">
                <span className="w-16 pl-9 text-xs text-[#64748B]">radius</span>
                <input
                  value={tokens.radius}
                  onChange={(e) => setToken("radius", e.target.value)}
                  className="flex-1 rounded-md border border-black/10 bg-white px-2 py-1 font-mono text-xs outline-none focus:border-[#10B981]"
                />
              </div>
            </div>
          </div>

          {history.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-medium text-[#64748B]">Versions</div>
              <ul className="space-y-1">
                {history.map((v, i) => (
                  <li key={i}>
                    <button
                      onClick={() => applyCode(v.code)}
                      className="w-full truncate rounded-lg px-2 py-1.5 text-left text-xs text-[#475569] hover:bg-black/5"
                      title="Restore this version"
                    >
                      <span className="text-[#94A3B8]">v{history.length - i} · </span>
                      {v.prompt}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        {/* Right: live preview + code (with a streaming overlay while generating) */}
        <section className="relative flex min-h-0 flex-col">
          {/* viewport toggle */}
          <div className="flex items-center gap-1 border-b border-black/5 px-3 py-1.5">
            {(Object.keys(VIEWPORTS) as Viewport[]).map((v) => (
              <button
                key={v}
                onClick={() => setViewport(v)}
                className={`rounded px-2.5 py-0.5 text-xs capitalize transition ${
                  viewport === v ? "bg-[#10B981] text-white" : "text-[#64748B] hover:bg-black/5"
                }`}
              >
                {v}
              </button>
            ))}
            <span className="ml-auto text-[11px] text-[#94A3B8]">{VIEWPORTS[viewport]}</span>
          </div>

          {loading && (
            <div className="absolute inset-0 z-10 flex flex-col bg-[#0F172A]">
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2 text-xs text-white/70">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#10B981]" />
                generating{model ? ` · ${model}` : ""}…
              </div>
              <pre className="flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-[11px] leading-relaxed text-emerald-200/90">
                {streamRaw.slice(-4000) || "…"}
              </pre>
            </div>
          )}

          <SandpackProvider
            key={gen /* remount fresh on each generation / version restore */}
            template="react-ts"
            files={{ "/App.tsx": code }}
            theme="light"
            options={{ externalResources: ["https://cdn.tailwindcss.com"] }}
          >
            <SandpackLayout style={{ flex: 1, minHeight: 0, border: "none", borderRadius: 0 }}>
              <SandpackCodeEditor showLineNumbers showTabs style={{ height: "100%" }} />
              <div className="min-w-0 flex-1 overflow-auto bg-black/[0.03] p-3">
                <div
                  className="mx-auto h-full bg-white shadow-sm transition-all"
                  style={{ width: VIEWPORTS[viewport], maxWidth: "100%" }}
                >
                  <SandpackPreview
                    showOpenInCodeSandbox={false}
                    showRefreshButton
                    style={{ height: "100%" }}
                  />
                </div>
              </div>
            </SandpackLayout>
          </SandpackProvider>
        </section>
      </div>
    </div>
  );
}
