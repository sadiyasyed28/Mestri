// Phase 2.2 — per-incident detail page. Fetches /api/incidents/:id from the server.

import { useEffect, useState } from "react";
import { Link } from "wouter";

type IncidentDetail = {
  providerId: string;
  providerName: string;
  id: string;
  name: string;
  impact: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  updates: Array<{ body: string; status: string; updatedAt: string }>;
};

function fmt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en", { dateStyle: "medium", timeStyle: "short" });
}

export default function Incident({ params }: { params: { id: string } }) {
  const [incident, setIncident] = useState<IncidentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);
    void fetch(`/api/incidents/${encodeURIComponent(params.id)}`)
      .then((r) => {
        if (r.status === 404) throw new Error("Incident not found");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<IncidentDetail>;
      })
      .then(setIncident)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [params.id]);

  const descriptionText = incident
    ? incident.resolvedAt
      ? `${incident.providerName} reported this incident ${fmt(incident.createdAt)} and resolved it ${fmt(incident.resolvedAt)}.`
      : `${incident.providerName} reported this incident ${fmt(incident.createdAt)} and is still working on it.`
    : "Fetching the latest record from the mestri archive.";

  return (
    <main className="app-shell">
      <div className="page-frame">
        <header className="site-header">
          <Link className="brand-lockup" href="/" aria-label="mestri home">
            <img src="/mestri-mark.svg" alt="" className="brand-mark" />
            <span className="brand-name"><span>mestri</span></span>
          </Link>
          <div className="header-actions">
            <span className="section-kicker">/03 · Incident</span>
          </div>
        </header>

        <section className="intro-block">
          <div className="intro-line">
            <span><b>/03</b> Incident detail</span>
            <span className="intro-note">{incident?.providerName ?? params.id}</span>
          </div>
          <h1>
            {incident?.name ?? "Loading incident…"}
          </h1>
          <div className="intro-foot">
            <p>{descriptionText}</p>
          </div>
        </section>

        <section className="provider-section" aria-labelledby="incident-heading">
          <div className="section-heading">
            <div>
              <span className="section-kicker">/04</span>
              <h2 id="incident-heading">Timeline</h2>
            </div>
            <Link href="/" className="refresh-button footer-link" aria-label="Back to status">
              &larr; Back
            </Link>
          </div>

          {loading ? (
            <p className="changelog-loading">Loading…</p>
          ) : error ? (
            <p className="changelog-error">{error}</p>
          ) : incident ? (
            <ol className="changelog-list">
              <li className="changelog-item">
                <span className="changelog-date">{fmt(incident.createdAt)}</span>
                <h3>{incident.status || "Created"}</h3>
                <p>
                  Impact: <strong>{incident.impact || "—"}</strong> · ID:{" "}
                  <code>{incident.id}</code>
                </p>
              </li>
              {incident.updates.map((u, i) => (
                <li key={`${u.updatedAt}-${i}`} className="changelog-item">
                  <span className="changelog-date">{fmt(u.updatedAt)}</span>
                  <h3>{u.status || "Update"}</h3>
                  <p>{u.body || "—"}</p>
                </li>
              ))}
              {incident.resolvedAt ? (
                <li className="changelog-item">
                  <span className="changelog-date">{fmt(incident.resolvedAt)}</span>
                  <h3>Resolved</h3>
                  <p>Provider marked this incident as resolved.</p>
                </li>
              ) : null}
            </ol>
          ) : null}
        </section>

        <footer className="site-footer">
          <div className="footer-copy">
            <img src="/mestri-mark.svg" alt="" className="footer-mark" />
            <p>
              <strong>mestri</strong> · the signal, not the speculation.
            </p>
          </div>
          <div className="footer-mono">
            <Link href="/" className="footer-link">Back to status</Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
