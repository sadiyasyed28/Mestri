// Quiet Signal Ledger: editorial hierarchy, direct actions, restrained status semantics.

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Check, CircleAlert, CircleX, ExternalLink, LoaderCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createInitialSnapshot,
  fetchProviderSnapshot,
  PROVIDERS,
  type HistoryKind,
  type ProviderConfig,
  type ProviderSnapshot,
  type StatusKind,
} from "@/lib/statusFeeds";

const HISTORY_LENGTH = 30;

function relativeTime(timestamp?: string) {
  if (!timestamp) return "No recent update";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "No recent update";

  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const ranges: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, divisor] of ranges) {
    if (Math.abs(seconds) >= divisor) return formatter.format(Math.round(seconds / divisor), unit);
  }
  return "just now";
}

function exactTime(timestamp?: string) {
  if (!timestamp) return undefined;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? undefined : date.toLocaleString("en", { dateStyle: "medium", timeStyle: "short" });
}

function statusLabel(status: StatusKind) {
  if (status === "operational") return "Operational";
  if (status === "degraded") return "Degraded";
  if (status === "outage") return "Outage";
  return "Feed unavailable";
}

function statusCopy(status: StatusKind) {
  if (status === "operational") return "No active incident";
  if (status === "degraded") return "Active degradation";
  if (status === "outage") return "Active outage";
  return "Feed unavailable";
}

function StatusIcon({ status }: { status: StatusKind }) {
  if (status === "operational") return <Check aria-hidden="true" size={14} strokeWidth={2.4} />;
  if (status === "outage") return <CircleX aria-hidden="true" size={14} strokeWidth={2.1} />;
  if (status === "degraded") return <CircleAlert aria-hidden="true" size={14} strokeWidth={2.1} />;
  return <ExternalLink aria-hidden="true" size={13} strokeWidth={2.1} />;
}

function HistoryStrip({ history, provider }: { history: HistoryKind[]; provider: ProviderConfig }) {
  const segments = history.length === HISTORY_LENGTH ? history : Array.from({ length: HISTORY_LENGTH }, () => "unknown" as HistoryKind);
  return (
    <div className="history-strip" role="img" aria-label={`${provider.name} daily uptime signal for the last 30 days`}>
      {segments.map((state, index) => (
        <span
          className={`history-segment history-${state}`}
          key={`${provider.id}-${index}`}
          title={`${index === segments.length - 1 ? "Today" : `${segments.length - 1 - index} days ago`}: ${state === "unknown" ? "Unavailable" : statusLabel(state)}`}
        />
      ))}
    </div>
  );
}

function ProviderMark({ provider }: { provider: ProviderConfig }) {
  return (
    <div className="provider-mark" style={{ "--mark-accent": provider.accent } as React.CSSProperties} aria-hidden="true">
      {provider.id === "google" ? (
        <span className="google-mark"><i /><i /><i /><i /></span>
      ) : (
        provider.monogram
      )}
    </div>
  );
}

function ProviderRow({ provider, snapshot, index }: { provider: ProviderConfig; snapshot: ProviderSnapshot; index: number }) {
  const timestampLabel = exactTime(snapshot.timestamp);
  const isManual = snapshot.status === "manual";

  return (
    <article className={`provider-row row-${snapshot.status}`} style={{ "--row-delay": `${index * 55}ms` } as React.CSSProperties}>
      <div className="provider-identity">
        <span className="row-index">0{index + 1}</span>
        <ProviderMark provider={provider} />
        <div>
          <h2>{provider.name}</h2>
          <p>{provider.service}</p>
        </div>
      </div>

      <div className="provider-status">
        <div className={`status-pill status-${snapshot.status}`}>
          <StatusIcon status={snapshot.status} />
          <span>{statusLabel(snapshot.status)}</span>
        </div>
        <span className="status-subline">{statusCopy(snapshot.status)}</span>
      </div>

      <div className="provider-history">
        <div className="column-kicker">
          <span>Daily uptime signal</span>
          <span>{isManual ? "Not available" : "30 days"}</span>
        </div>
        <HistoryStrip history={snapshot.history} provider={provider} />
        <div className="history-scale"><span>30 days ago</span><span>Today</span></div>
      </div>

      <div className="provider-update">
        <div className="column-kicker"><span>Latest provider update</span></div>
        <p className={isManual ? "update-manual" : undefined}>{snapshot.message}</p>
        <div className="update-meta">
          {timestampLabel ? <time dateTime={snapshot.timestamp} title={timestampLabel}>{relativeTime(snapshot.timestamp)}</time> : <span>Source check required</span>}
          <span className="meta-dot" aria-hidden="true" />
          <a href={provider.sourceUrl} target="_blank" rel="noreferrer">
            {isManual ? "Check manually" : provider.sourceLabel}
            <ArrowUpRight aria-hidden="true" size={13} strokeWidth={2} />
          </a>
        </div>
      </div>
    </article>
  );
}

export default function Home() {
  const initialSnapshots = useMemo(
    () => Object.fromEntries(PROVIDERS.map((provider) => [provider.id, createInitialSnapshot(provider)])) as Record<string, ProviderSnapshot>,
    [],
  );
  const [snapshots, setSnapshots] = useState(initialSnapshots);
  const [isRefreshing, setIsRefreshing] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date>(() => new Date());

  const loadSnapshots = useCallback(async () => {
    setIsRefreshing(true);
    const entries = await Promise.all(PROVIDERS.map(async (provider) => [provider.id, await fetchProviderSnapshot(provider)] as const));
    setSnapshots(Object.fromEntries(entries));
    setLastChecked(new Date());
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    void loadSnapshots();
  }, [loadSnapshots]);

  return (
    <main className="app-shell">
      <div className="page-frame">
        <header className="site-header">
          <a className="brand-lockup" href="/" aria-label="mestri home">
            <img src="/manus-storage/mestri-mark_e18832b9.png" alt="" className="brand-mark" />
            <span className="brand-name"><span>mestri</span></span>
          </a>
          <div className="header-actions">
            <div className="header-status">
              <span className="live-dot" aria-hidden="true" />
              <span>Live provider signal</span>
            </div>
          </div>
        </header>

        <section className="intro-block">
          <div className="intro-line">
            <span><b>/01</b> AI service availability</span>
            <span className="intro-note">No signup · Provider-reported</span>
          </div>
          <h1>The signal,<br /><em>not the speculation.</em></h1>
          <div className="intro-foot">
            <p>One quiet place to check whether the AI tools you rely on are up, degraded, or having a difficult day.</p>
            <div className="checked-note">
              <span>Last checked</span>
              <strong>{lastChecked.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}</strong>
              <span className="timezone">local time</span>
            </div>
          </div>
        </section>

        <section className="provider-section" aria-labelledby="providers-heading">
          <div className="section-heading">
            <div>
              <span className="section-kicker">/02</span>
              <h2 id="providers-heading">Provider signal</h2>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="refresh-button"
              onClick={() => void loadSnapshots()}
              disabled={isRefreshing}
              aria-label="Refresh provider status"
            >
              {isRefreshing ? <LoaderCircle className="spin" aria-hidden="true" size={15} /> : <RefreshCw aria-hidden="true" size={15} />}
              <span>{isRefreshing ? "Checking" : "Refresh"}</span>
            </Button>
          </div>

          <div className="provider-list">
            {PROVIDERS.map((provider, index) => (
              <ProviderRow key={provider.id} provider={provider} snapshot={snapshots[provider.id]} index={index} />
            ))}
          </div>
        </section>

        <footer className="site-footer">
          <div className="footer-copy">
            <img src="/manus-storage/mestri-mark_e18832b9.png" alt="" className="footer-mark" />
            <p><strong>mestri</strong> reads public status pages where possible, and links you straight to the source when a provider does not expose a browser-readable feed.</p>
          </div>
          <span className="footer-mono">Built for clear mornings &amp; messy launches</span>
        </footer>
      </div>
    </main>
  );
}
