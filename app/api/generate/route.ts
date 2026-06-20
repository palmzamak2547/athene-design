// app/api/generate/route.ts
//
// prompt (+ current code + tokens) → a STREAM of the component source. Streaming
// is what makes a free model feel alive: tokens appear immediately instead of a
// 45s blank wait while a long component generates. The model is constrained to
// the design tokens (the wedge) and to output Sandpack can render as-is. With a
// Groq or Cerebras key the same generation finishes in ~2-3s.
import { streamText } from "ai";
import { candidates } from "@/lib/providers";
import { rateLimit, SHARED_LIMIT } from "@/lib/ratelimit";
import { tokensPrompt, type Tokens } from "@/lib/tokens";

export const runtime = "nodejs";
export const maxDuration = 60;

function systemPrompt(tokens: Tokens): string {
  return `You are Athene Design — you turn a request into ONE production-quality React component.

OUTPUT CONTRACT (strict):
- Return ONLY the code for a single file. No prose, no explanation, no markdown fences.
- Default-export a component named App: \`export default function App() { ... }\`.
- It must be SELF-CONTAINED: only "import React, { useState } from 'react'" if you need hooks — no other imports, no external libraries, no image URLs that could 404 (use inline SVG or solid color blocks).
- Style with Tailwind utility classes ONLY (Tailwind runs in the preview). Make it responsive and accessible (semantic elements, alt text, labels).
- Real, specific content — never lorem ipsum, never "Card 1 / Card 2".

${tokensPrompt(tokens)}

Build something polished and intentional, not a generic template.`;
}

function userPrompt(prompt: string, currentCode?: string): string {
  if (currentCode && currentCode.trim()) {
    return `Here is the current component:\n\n${currentCode}\n\nApply this change, returning the FULL updated component:\n${prompt}`;
  }
  return `Create this:\n${prompt}`;
}

export async function POST(req: Request) {
  let body: { prompt?: string; currentCode?: string; tokens?: Tokens };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const prompt = (body.prompt ?? "").trim();
  if (!prompt) return Response.json({ error: "prompt is required" }, { status: 400 });

  // BYO key: a visitor's own free NVIDIA key uses THEIR quota and skips the
  // shared-key rate limit. Otherwise the host's free key is guarded per-IP so
  // one visitor can't exhaust it for everyone.
  const userKey = req.headers.get("x-nvidia-key")?.trim() || undefined;
  if (!userKey) {
    const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
    const rl = rateLimit(ip);
    if (!rl.ok) {
      return Response.json(
        {
          error: `You've hit the shared-key limit (${SHARED_LIMIT}/hour). Add your own free NVIDIA key in settings to keep generating — it's instant and unlimited for you.`,
          retryAfterMs: rl.resetMs,
          needKey: true,
        },
        { status: 429, headers: { "retry-after": String(Math.ceil(rl.resetMs / 1000)) } },
      );
    }
  }

  const cands = candidates(userKey);
  if (cands.length === 0) {
    return Response.json(
      {
        error: userKey
          ? "That key didn't work for NVIDIA NIM — check it at build.nvidia.com."
          : "No model key set on the server.",
      },
      { status: userKey ? 400 : 500 },
    );
  }

  // Stream from the best available model. (Mid-stream failover isn't possible
  // once bytes are flowing; maxRetries handles transient errors, and the chain
  // leads with whatever fast provider has a key.)
  const chosen = cands[0];
  const result = streamText({
    model: chosen.model,
    system: systemPrompt(body.tokens ?? ({} as Tokens)),
    prompt: userPrompt(prompt, body.currentCode),
    temperature: 0.4,
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(55_000),
  });

  return result.toTextStreamResponse({ headers: { "x-athene-model": chosen.label } });
}
