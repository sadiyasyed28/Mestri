import express from "express";
import { createServer } from "http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { statusRouter } from "./routes/status.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Parse JSON bodies for /api/notifications POST etc.
  app.use(express.json({ limit: "32kb" }));

  // Mount the status API.
  app.use("/api", statusRouter);

  // ----- RSS / Atom feeds (Phase 2.1) -----
  const { feedRouter } = await import("./routes/feeds.js");
  app.use("/api/feeds", feedRouter);

  // ----- Notifications (Phase 2.3) -----
  const { notificationRouter, initNotificationStore } = await import("./routes/notifications.js");
  app.use("/api/notifications", notificationRouter);
  void initNotificationStore();

  // Serve static files from dist in production (built by `pnpm build:client`).
  const staticPath = path.resolve(__dirname, "..", "dist");
  app.use(express.static(staticPath));

  // Embed widget route — Phase 3.3.
  // Single-file HTML response so it can be embedded in any <iframe>.
  app.get("/embed/:providerId", (_req, res) => {
    const html = `<!doctype html><meta charset="utf-8"><title>mestri embed</title>
<style>body{font-family:system-ui,sans-serif;margin:0;padding:8px;background:#f5f4ef;color:#18201b}
a{color:inherit;text-decoration:none}
.row{display:flex;align-items:center;gap:8px}
.dot{width:8px;height:8px;border-radius:50%}
.s{font-family:"IBM Plex Mono",monospace;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
</style>
<div id="mestri-embed">Loading…</div>
<script>
(async()=>{
  try{
    const r=await fetch("/api/status");
    const j=await r.json();
    const s=j[location.pathname.split("/").pop()]||{status:"manual",message:"Feed unavailable",sourceUrl:"#"};
    const colors={operational:"#9bc440",degraded:"#d6a348",outage:"#d76750",manual:"#7c817b"};
    document.getElementById("mestri-embed").innerHTML=
      '<div class="row"><span class="dot" style="background:'+colors[s.status]+'"></span>'+
      '<span class="s">'+s.status+'</span></div>'+
      '<a href="'+s.sourceUrl+'" target="_blank" rel="noreferrer">'+ (s.message||"") +'</a>';
  }catch(e){document.getElementById("mestri-embed").textContent="Embed unavailable";}
})();
</script>`;
    res.set("Content-Type", "text/html; charset=utf-8");
    res.set("Cache-Control", "public, max-age=60");
    res.send(html);
  });

  // Sitemap for SEO (Phase 2.2).
  app.get("/sitemap.xml", async (_req, res) => {
    const { buildSitemap } = await import("./routes/sitemap.js");
    res.set("Content-Type", "application/xml");
    res.set("Cache-Control", "public, max-age=300");
    res.send(await buildSitemap());
  });

  // Robots.txt — explicit allow + sitemap pointer.
  app.get("/robots.txt", (_req, res) => {
    res.type("text/plain").send("User-agent: *\nAllow: /\nSitemap: /sitemap.xml\n");
  });

  // Handle client-side routing — serve index.html for any non-API GET.
  app.get(/^\/(?!api\/|embed\/|sitemap\.xml|robots\.txt).*/, (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;
  server.listen(port, () => {
    console.log(`mestri running on http://localhost:${port}/`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start mestri server:", err);
  process.exit(1);
});
