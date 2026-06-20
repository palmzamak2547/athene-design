# 🎨 Athene Design

Free, frontier-class **prompt → editable UI**. Describe a component, watch it
stream in, see it live — on-brand to *your* design tokens. Part of the open
**Athene** suite (alongside [Athene CLI](https://github.com/palmzamak2547/athene-cli)).

It doesn't train a model; it orchestrates the best **free** ones (NVIDIA NIM,
Groq, Cerebras, OpenRouter) behind one interface — the same engine as the CLI.

## Why it's different

Every incumbent (v0 / Bolt / Claude Artifacts / Canvas) generates raw, generic
UI with **no design-system awareness**. Athene Design constrains generation to a
**token set you control** — primary, surface, ink, muted, radius, font — so the
output is on-brand, not another generic 3-column card grid. That's the wedge.

- **Live preview** — the generated component runs in a sandboxed iframe (Sandpack
  + Tailwind), not just shown as text.
- **Streaming** — tokens appear in well under a second (time-to-first-byte ~0.75s
  on free NIM; ~2-3s end-to-end with a Groq/Cerebras key), so it never feels like
  a blank wait.
- **Design tokens** — edit your brand colors/radius live; every generation obeys them.
- **Version history** — every generation is a checkpoint you can restore (AI edits
  regress; cheap undo makes iteration safe).
- **Iterate in place** — your next prompt edits the current component, not a fresh one.

## Quick start

```bash
npm install
echo "NVIDIA_API_KEY=nvapi-..." > .env.local   # free at build.nvidia.com
# optional, much faster: GROQ_API_KEY=... or CEREBRAS_API_KEY=...
npm run dev
```

Open the studio, type a prompt (e.g. *"a pricing page with 3 tiers and a
monthly/annual toggle"*), and watch it build.

## Stack

Next.js 16 (App Router) · React 19 · Tailwind 4 · `@codesandbox/sandpack-react`
for the live preview · Vercel AI SDK 5 + `@ai-sdk/openai-compatible` for the
free-model failover chain (`lib/providers.ts`, shared shape with the CLI).

## Status

**Phase 0** — the core loop works end-to-end: prompt → streamed, token-aware
component → live Sandpack preview → version history. Verified on free NIM
(`llama-3.3-70b`).

**Next:** visual select-to-edit (click an element → change it with no LLM
regen — the decisive feature), section-scoped edits, screenshot → UI, runtime
error → auto-fix, and export to a real React/Tailwind/shadcn project.

MIT licensed.
