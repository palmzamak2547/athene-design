// lib/extract.ts
//
// Pull the component source out of whatever the model streamed: strip markdown
// fences and any leading prose before the first import/export. Shared by the
// client (after a stream completes) — pure, no deps, runs anywhere.
export function extractCode(text: string): string | null {
  let t = text.trim();
  const fence = t.match(/```(?:tsx?|jsx?|javascript|typescript)?\s*\n([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  else t = t.replace(/```/g, ""); // unbalanced fence — drop stray markers
  const start = t.search(/^\s*(import |export default |function App|const App)/m);
  if (start > 0) t = t.slice(start);
  return /export default/.test(t) ? t.trim() : null;
}
