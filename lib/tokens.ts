// lib/tokens.ts
//
// Design tokens — the wedge. Every incumbent (v0 / Bolt / Claude Artifacts /
// Canvas) generates raw, generic UI with NO design-system awareness. Athene
// Design constrains generation to a token set the user controls, so output is
// on-brand instead of another generic 3-column card grid.
export type Tokens = {
  primary: string;
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  radius: string;
  font: string;
};

export const defaultTokens: Tokens = {
  primary: "#10B981", // emerald
  bg: "#FAFAFA",
  surface: "#FFFFFF",
  ink: "#0F172A",
  muted: "#64748B",
  radius: "0.75rem",
  font: "Inter, ui-sans-serif, system-ui, sans-serif",
};

// Render the tokens as an instruction block the model must obey.
export function tokensPrompt(t: Tokens): string {
  return [
    "Use ONLY this design system — do not invent other colors:",
    `- primary / accent: ${t.primary}`,
    `- page background: ${t.bg}`,
    `- card/surface background: ${t.surface}`,
    `- primary text (ink): ${t.ink}`,
    `- secondary/muted text: ${t.muted}`,
    `- border radius: ${t.radius}`,
    `- font family: ${t.font}`,
    "Apply them via Tailwind arbitrary values, e.g. bg-[" + t.primary + "], text-[" + t.ink + "], rounded-[" + t.radius + "].",
  ].join("\n");
}
