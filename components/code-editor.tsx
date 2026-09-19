"use client";

import { useRef, useState } from "react";

export default function CodeEditor({ value, onChange, label }: {
  value: string; onChange: (value: string) => void; label: string;
}) {
  const gutter = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState("");
  const lines = value.split(/\r\n|\r|\n/).length;
  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-cyan-300/20 bg-[#080e19]">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <span className="font-mono text-xs text-cyan-200">{label}</span>
        <button type="button" className="text-xs text-slate-300 hover:text-cyan-200" onClick={async () => {
          try { await navigator.clipboard.writeText(value); setNotice("Copied"); }
          catch { setNotice("Copy unavailable. Select text and copy manually."); }
        }}>Copy code</button>
      </header>
      <div className="flex h-72 font-mono text-sm leading-6">
        <div ref={gutter} aria-hidden="true" className="shrink-0 overflow-hidden border-r border-white/5 px-3 py-3 text-right text-slate-600 select-none">
          {Array.from({ length: lines }, (_, i) => <div key={i}>{i + 1}</div>)}
        </div>
        <textarea aria-label={label} value={value} wrap="off" spellCheck={false} autoCapitalize="off" autoCorrect="off"
          className="min-w-0 flex-1 resize-none overflow-auto bg-transparent p-3 font-mono text-sm leading-6 text-slate-200 outline-none focus:bg-cyan-300/[.02]"
          style={{ tabSize: 4 }} placeholder="// Paste your code or text here..."
          onChange={(event) => { onChange(event.target.value); setNotice(""); }}
          onScroll={(event) => { if (gutter.current) gutter.current.scrollTop = event.currentTarget.scrollTop; }}
          onKeyDown={(event) => {
            if (event.key !== "Tab" || event.shiftKey) return;
            event.preventDefault();
            const input = event.currentTarget;
            const start = input.selectionStart;
            onChange(value.slice(0, start) + "\t" + value.slice(input.selectionEnd));
            requestAnimationFrame(() => input.setSelectionRange(start + 1, start + 1));
          }} />
      </div>
      <footer className="flex flex-wrap justify-between gap-2 border-t border-white/10 px-4 py-2 font-mono text-xs text-slate-500">
        <span>{lines} lines · {value.length} characters · UTF-8</span>
        <span role="status">{notice || "Tab: indent · Shift+Tab: leave editor"}</span>
      </footer>
    </section>
  );
}
