// Phase 2.4 — the /changelog page. Reads CHANGELOG.md from /public/ at runtime
// and renders a tiny, paper-styled article view.

import { useEffect, useState } from "react";
import { Link } from "wouter";

type Change = { date: string; title: string; body: string };

function parseChangelog(markdown: string): Change[] {
  const lines = markdown.split(/\r?\n/);
  const changes: Change[] = [];
  let current: Change | null = null;
  let bodyBuffer: string[] = [];
  const dateRegex = /^##\s+\[(?:\d{4}-\d{2}-\d{2})\]\s+(.+)$/;
  for (const line of lines) {
    const m = line.match(dateRegex);
    if (m) {
      if (current) {
        current.body = bodyBuffer.join("\n").trim();
        changes.push(current);
      }
      // Date is parsed but not enforced — we trust the markdown author.
      current = { date: line.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "", title: m[1].trim(), body: "" };
      bodyBuffer = [];
    } else if (current) {
      bodyBuffer.push(line);
    }
  }
  if (current) {
    current.body = bodyBuffer.join("\n").trim();
    changes.push(current);
  }
  return changes;
}

function renderBody(body: string): React.ReactElement {
  // Tiny markdown-ish renderer: paragraphs + bullet lists.
  const blocks = body.split(/\n\s*\n/);
  return (
    <>
      {blocks.map((block, i) => {
        const trimmed = block.trim();
        if (!trimmed) return null;
        if (/^[-*]\s/.test(trimmed.split("\n")[0] ?? "")) {
          const items = trimmed.split("\n").map((l) => l.replace(/^[-*]\s+/, ""));
          return (
            <ul key={i}>
              {items.map((it, j) => (
                <li key={j}>{it}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{trimmed}</p>;
      })}
    </>
  );
}

export default function Changelog() {
  const [changes, setChanges] = useState<Change[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/CHANGELOG.md")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((md) => setChanges(parseChangelog(md)))
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <main className="app-shell">
      <div className="page-frame">
        <header className="site-header">
          <Link className="brand-lockup" href="/" aria-label="mestri home">
            <img src="/mestri-mark.svg" alt="" className="brand-mark" />
            <span className="brand-name"><span>mestri</span></span>
          </Link>
          <div className="header-actions">
            <span className="section-kicker">/04 · Changelog</span>
          </div>
        </header>

        <section className="intro-block">
          <div className="intro-line">
            <span><b>/04</b> Changelog</span>
            <span className="intro-note">What changed · when</span>
          </div>
          <h1>
            What&rsquo;s <em>new.</em>
          </h1>
          <div className="intro-foot">
            <p>
              Every release of mestri, in plain language. Honest about what shipped,
              what changed, and what&rsquo;s coming next.
            </p>
          </div>
        </section>

        <section className="provider-section" aria-labelledby="changes-heading">
          <div className="section-heading">
            <div>
              <span className="section-kicker">/05</span>
              <h2 id="changes-heading">All changes</h2>
            </div>
          </div>

          {error ? (
            <p className="changelog-error">Could not load changelog: {error}</p>
          ) : changes.length === 0 ? (
            <p className="changelog-loading">Loading…</p>
          ) : (
            <ol className="changelog-list">
              {changes.map((c, i) => (
                <li key={`${c.date}-${i}`} className="changelog-item">
                  <span className="changelog-date">{c.date || "—"}</span>
                  <h3>{c.title}</h3>
                  {renderBody(c.body)}
                </li>
              ))}
            </ol>
          )}
        </section>

        <footer className="site-footer">
          <div className="footer-copy">
            <img src="/mestri-mark.svg" alt="" className="footer-mark" />
            <p><strong>mestri</strong> · the signal, not the speculation.</p>
          </div>
          <div className="footer-mono">
            <Link href="/" className="footer-link">Back to status</Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
