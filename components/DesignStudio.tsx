"use client";
//
// The studio: a prompt + token panel on the left, a LIVE preview (Sandpack runs
// the generated component in a sandboxed iframe with Tailwind) + code on the
// right. Each generation is a version you can restore — AI edits regress, so
// cheap undo is what makes aggressive iteration safe.
import { useState, useEffect } from "react";
import {
  SandpackProvider,
  SandpackLayout,
  SandpackCodeEditor,
  SandpackPreview,
} from "@codesandbox/sandpack-react";
import { defaultTokens, type Tokens } from "@/lib/tokens";
import { extractCode } from "@/lib/extract";

const SHARED_LIMIT = 20; // mirrors lib/ratelimit (display only)

// The Athene suite — this site is its web home; the rest link out. (Unified,
// like claude.ai keeps chat/code/artifacts under one roof — not scattered.)
const SUITE: { name: string; note: string; href?: string; here?: boolean }[] = [
  { name: "CLI", note: "terminal agent", href: "https://github.com/palmzamak2547/athene-cli" },
  { name: "Design", note: "you're here", here: true },
  { name: "Desktop", note: "local-first chat", href: "https://github.com/palmzamak2547/athene-desktop" },
  { name: "Bridge", note: "Telegram", href: "https://github.com/palmzamak2547/athene-bridge" },
];

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

// One-click refinements (Canvas-style) applied to the current component.
const QUICK_ACTIONS: { label: string; prompt: string }[] = [
  { label: "Make responsive", prompt: "Make this fully responsive — it should look great on mobile, tablet, and desktop." },
  { label: "Add hover/focus", prompt: "Add tasteful hover and focus states to all interactive elements, keyboard-accessible." },
  { label: "Improve hierarchy", prompt: "Improve the visual hierarchy and spacing — sharpen typography scale, alignment, and whitespace." },
  { label: "Add dark mode", prompt: "Add a dark-mode variant using the design tokens, with a toggle." },
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
  const [userKey, setUserKey] = useState(""); // BYO NVIDIA key (browser-only)
  const [keyOpen, setKeyOpen] = useState(false);

  useEffect(() => {
    setUserKey(localStorage.getItem("athene-nim-key") ?? "");
  }, []);
  function saveKey(k: string) {
    setUserKey(k);
    try {
      if (k) localStorage.setItem("athene-nim-key", k);
      else localStorage.removeItem("athene-nim-key");
    } catch {
      /* storage blocked — keep it in memory for this session */
    }
  }

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

  async function generate(override?: string) {
    const p = (override ?? prompt).trim();
    if (!p || loading) return;
    setLoading(true);
    setError("");
    setStreamRaw("");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(userKey ? { "x-nvidia-key": userKey } : {}), // BYO key → their quota, no shared limit
        },
        // First prompt = a fresh component (replace the starter); later prompts
        // iterate on the current canvas.
        body: JSON.stringify({ prompt: p, currentCode: history.length ? code : undefined, tokens }),
      });
      if (!res.ok || !res.body) {
        let msg = `request failed (${res.status})`;
        let needKey = false;
        try {
          const j = await res.json();
          msg = j.error ?? msg;
          needKey = !!j.needKey;
        } catch {
          /* not JSON */
        }
        setError(msg);
        if (needKey) setKeyOpen(true); // shared-key limit → nudge to add their own
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
    <div className="flex h-dvh flex-col bg-paper text-ink">
      <header className="flex items-center justify-between border-b border-line px-6 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand text-[15px] font-bold text-white shadow-sm">
            A
          </span>
          <span className="font-display text-[17px] font-semibold tracking-tight">Athene</span>
          <span className="ml-1 rounded-full border border-line bg-surface px-2.5 py-[3px] text-[11px] font-medium text-muted">
            Design
          </span>
        </div>
        <div className="flex items-center gap-2">
          {model && (
            <span className="mr-1 hidden text-[11px] text-faint sm:inline">generated by {model}</span>
          )}
          <div className="relative">
            <button
              onClick={() => setKeyOpen((o) => !o)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium shadow-sm ${
                userKey
                  ? "border-brand/40 bg-brand-wash text-ink"
                  : "border-line bg-surface text-ink hover:bg-surface-2"
              }`}
            >
              {userKey ? "Your key ✓" : "Key"}
            </button>
            {keyOpen && (
              <div className="absolute right-0 top-10 z-30 w-72 rounded-xl border border-line bg-surface p-3.5 text-left shadow-xl">
                <div className="text-xs font-semibold text-ink">Your NVIDIA key — optional</div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  Use ours free (up to {SHARED_LIMIT}/hour). Or paste your own free key from
                  build.nvidia.com for unlimited generations — it stays in your browser, never sent anywhere but NVIDIA.
                </p>
                <input
                  value={userKey}
                  onChange={(e) => saveKey(e.target.value.trim())}
                  placeholder="nvapi-…"
                  spellCheck={false}
                  className="mt-2.5 w-full rounded-lg border border-line bg-paper px-2.5 py-1.5 font-mono text-xs text-ink outline-none focus:border-brand focus:ring-2 focus:ring-[var(--brand-wash)]"
                />
                <div className="mt-2 flex items-center justify-between">
                  <a
                    href="https://build.nvidia.com"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] font-medium text-brand hover:underline"
                  >
                    Get a free key ↗
                  </a>
                  {userKey && (
                    <button onClick={() => saveKey("")} className="text-[11px] text-faint hover:text-ink">
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={copyCode}
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink shadow-sm hover:bg-surface-2"
          >
            {copied ? "Copied ✓" : "Copy code"}
          </button>
          <button
            onClick={downloadCode}
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink shadow-sm hover:bg-surface-2"
          >
            Download
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[380px_1fr]">
        {/* Left: prompt + tokens + history */}
        <aside className="flex min-h-0 flex-col gap-5 overflow-y-auto border-r border-line p-5">
          <div>
            <label className="mb-1.5 block text-xs font-semibold tracking-wide text-muted">
              Describe a change
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") generate();
              }}
              rows={4}
              placeholder="a pricing page with 3 tiers and a monthly/annual toggle"
              className="w-full resize-none rounded-xl border border-line bg-surface p-3.5 text-sm leading-relaxed text-ink shadow-sm outline-none placeholder:text-faint focus:border-brand focus:ring-4 focus:ring-[var(--brand-wash)]"
            />
            <button
              onClick={() => generate()}
              disabled={loading || !prompt.trim()}
              className="mt-2.5 w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-[1.04] active:scale-[0.99] disabled:opacity-40 disabled:active:scale-100"
            >
              {loading ? "Generating…" : history.length ? "Apply change" : "Generate"}
            </button>
            <p className="mt-1.5 text-[10px] text-faint">⌘/Ctrl+Enter to run</p>
            {error && (
              <p className="mt-2.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-600">
                {error}
              </p>
            )}
            {history.length === 0 && (
              <div className="mt-3">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-faint">try</div>
                <div className="flex flex-wrap gap-1.5">
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      onClick={() => setPrompt(ex)}
                      className="rounded-full border border-line bg-surface px-2.5 py-1 text-left text-[11px] text-ink-2 hover:border-brand hover:bg-brand-wash hover:text-ink"
                    >
                      {ex.length > 32 ? ex.slice(0, 32) + "…" : ex}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {history.length > 0 && (
              <div className="mt-3">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-faint">refine</div>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_ACTIONS.map((qa) => (
                    <button
                      key={qa.label}
                      onClick={() => generate(qa.prompt)}
                      disabled={loading}
                      className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-ink-2 hover:border-brand hover:bg-brand-wash hover:text-ink disabled:opacity-40"
                    >
                      {qa.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-faint">
            Design tokens · your brand
          </div>
            <div className="space-y-2">
              {(["primary", "bg", "surface", "ink", "muted"] as (keyof Tokens)[]).map((k) => (
                <div key={k} className="flex items-center gap-2">
                  <input
                    type="color"
                    value={tokens[k]}
                    onChange={(e) => setToken(k, e.target.value)}
                    className="h-7 w-7 cursor-pointer rounded-md border border-line shadow-sm"
                    aria-label={k}
                  />
                  <span className="w-16 text-xs capitalize text-muted">{k}</span>
                  <input
                    value={tokens[k]}
                    onChange={(e) => setToken(k, e.target.value)}
                    className="flex-1 rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono text-xs text-ink outline-none focus:border-brand focus:ring-2 focus:ring-[var(--brand-wash)]"
                  />
                </div>
              ))}
              <div className="flex items-center gap-2">
                <span className="w-16 pl-9 text-xs text-muted">radius</span>
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
              <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-faint">
                Versions
              </div>
              <ul className="space-y-0.5">
                {history.map((v, i) => (
                  <li key={i}>
                    <button
                      onClick={() => applyCode(v.code)}
                      className="w-full truncate rounded-lg px-2.5 py-1.5 text-left text-xs text-ink-2 hover:bg-surface-2 hover:text-ink"
                      title="Restore this version"
                    >
                      <span className="font-mono text-faint">v{history.length - i} · </span>
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
          <div className="flex items-center gap-1 border-b border-line bg-surface px-4 py-2">
            <div className="flex items-center gap-0.5 rounded-lg bg-surface-2 p-0.5">
              {(Object.keys(VIEWPORTS) as Viewport[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setViewport(v)}
                  className={`rounded-md px-3 py-1 text-xs capitalize transition ${
                    viewport === v
                      ? "bg-surface text-ink shadow-sm"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            <span className="ml-auto font-mono text-[11px] text-faint">{VIEWPORTS[viewport]}</span>
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

      {/* Suite bar — this is the web home of the whole Athene suite. */}
      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-surface px-6 py-2 text-[11px]">
        <span className="font-display text-[13px] font-semibold text-ink">Athene</span>
        <span className="text-muted">the free, open AI dev suite</span>
        <nav className="ml-auto flex items-center gap-3 text-faint">
          {SUITE.map((s) =>
            s.here ? (
              <span key={s.name} className="font-semibold text-brand" title={s.note}>
                {s.name}
              </span>
            ) : (
              <a
                key={s.name}
                href={s.href}
                target="_blank"
                rel="noreferrer"
                className="transition hover:text-ink"
                title={s.note}
              >
                {s.name}
              </a>
            ),
          )}
          <a
            href="https://github.com/palmzamak2547"
            target="_blank"
            rel="noreferrer"
            className="transition hover:text-ink"
          >
            GitHub ↗
          </a>
        </nav>
      </footer>
    </div>
  );
}
