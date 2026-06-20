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
  return /export default/.test(t) ? ensureReactImport(t.trim()) : null;
}

const HOOKS = ["useState", "useEffect", "useRef", "useMemo", "useCallback", "useReducer", "useContext", "useLayoutEffect"];

// Free models routinely use a hook but forget to import it → the Sandpack
// preview dies with "useState is not defined". Repair it: add any hook the code
// actually calls to the React import (or prepend one if there's none).
function ensureReactImport(code: string): string {
  const used = HOOKS.filter((h) => new RegExp(`\\b${h}\\s*\\(`).test(code));
  if (used.length === 0) return code;
  const importRe = /^\s*import\s+React\s*(?:,\s*\{([^}]*)\})?\s*from\s*["']react["'];?/m;
  const m = code.match(importRe);
  if (!m) {
    // No `import React … from "react"`. If some other react import exists, leave
    // it alone (avoid a duplicate); otherwise prepend a complete one.
    if (/from\s*["']react["']/.test(code)) return code;
    return `import React, { ${used.join(", ")} } from "react";\n${code}`;
  }
  const existing = (m[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const missing = used.filter((h) => !existing.includes(h));
  if (missing.length === 0) return code;
  const merged = [...new Set([...existing, ...missing])].join(", ");
  return code.replace(importRe, `import React, { ${merged} } from "react";`);
}
