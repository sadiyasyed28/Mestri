import { Link } from "wouter";

export default function NotFound() {
  return (
    <main className="app-shell">
      <div className="page-frame">
        <header className="site-header">
          <Link className="brand-lockup" href="/" aria-label="mestri home">
            <img src="/mestri-mark.svg" alt="" className="brand-mark" />
            <span className="brand-name"><span>mestri</span></span>
          </Link>
          <div className="header-actions">
            <span className="section-kicker">404</span>
          </div>
        </header>

        <section className="intro-block">
          <div className="intro-line">
            <span><b>/404</b> Page not found</span>
            <span className="intro-note">No signal here</span>
          </div>
          <h1>
            Quiet,<br /><em>but empty.</em>
          </h1>
          <div className="intro-foot">
            <p>
              We couldn&rsquo;t find that page. The status board you came for is one click away.
            </p>
            <Link href="/" className="refresh-button footer-link" aria-label="Back to home">
              ← Back to status
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
