// lib/providers.ts
//
// Same free-model engine as the Athene CLI: every endpoint is OpenAI-compatible,
// so one factory covers NVIDIA NIM / Groq / Cerebras / OpenRouter. We try the
// coding-strongest model first and fail over on error (NIM rotates model IDs, so
// a static ID can go 410 — failover is how we stay free + resilient). Server-only:
// keys live in the environment, never reach the browser.
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

type Provider = { baseURL: string; keyEnv: string };

const PROVIDERS: Record<string, Provider> = {
  nim: { baseURL: "https://integrate.api.nvidia.com/v1", keyEnv: "NVIDIA_API_KEY" },
  groq: { baseURL: "https://api.groq.com/openai/v1", keyEnv: "GROQ_API_KEY" },
  cerebras: { baseURL: "https://api.cerebras.ai/v1", keyEnv: "CEREBRAS_API_KEY" },
  openrouter: { baseURL: "https://openrouter.ai/api/v1", keyEnv: "OPENROUTER_API_KEY" },
};

// Coding-capable free models, FAST first. UI generation needs a strong coder
// but a design tool lives or dies on latency — so we lead with quick instruct
// models (verified working + snappy) and keep heavier ones as fallbacks. NO
// reasoning models here: their thinking time makes a 60s round-trip.
const CHAIN: Array<[string, string]> = [
  ["groq", "openai/gpt-oss-120b"], // fastest when the key is set
  ["cerebras", "llama-3.3-70b"], // also very fast
  ["nim", "meta/llama-3.3-70b-instruct"], // always-on floor, quick
  ["nim", "qwen/qwen3.5-122b-a10b"], // stronger coder, slower
  ["openrouter", "qwen/qwen3-coder:free"],
];

export type Candidate = { model: LanguageModel; label: string };

export function candidates(): Candidate[] {
  const out: Candidate[] = [];
  for (const [provKey, modelId] of CHAIN) {
    const def = PROVIDERS[provKey];
    const apiKey = process.env[def.keyEnv];
    if (!apiKey) continue;
    const provider = createOpenAICompatible({ name: provKey, baseURL: def.baseURL, apiKey });
    out.push({ model: provider(modelId), label: `${provKey}:${modelId}` });
  }
  return out;
}
