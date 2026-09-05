import type { D1Database } from "@cloudflare/workers-types";
import type { ProviderConfig, HistoryKind, StatusKind } from "../../shared/statusFeeds";

export type DbStatusSnapshot = {
  id: number;
  providerId: string;
  status: StatusKind;
  message: string;
  timestamp?: string;
  history: HistoryKind[];
  createdAt: string;
};

export type DbIncident = {
  id: string;
  providerId: string;
  name: string;
  impact: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  updates: Array<{ body: string; status: string; updatedAt: string }>;
};

export type DbSubscription = {
  id: string;
  providerId: string;
  channel: "email" | "webhook";
  target: string;
  createdAt: string;
};

export type DbProviderState = {
  providerId: string;
  status: string;
  message?: string;
  updatedAt: string;
};

// SQL Row Shapes
type ProviderRow = {
  id: string;
  name: string;
  service: string;
  source_label: string;
  source_url: string;
  feed_url: string | null;
  incidents_url: string | null;
  accent: string;
  monogram: string;
  manual_only: number;
};

type SnapshotRow = {
  id: number;
  provider_id: string;
  status: string;
  message: string | null;
  timestamp: string | null;
  history: string;
  created_at: string;
};

type IncidentRow = {
  id: string;
  provider_id: string;
  name: string;
  impact: string;
  status: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  updates: string;
};

type SubscriptionRow = {
  id: string;
  provider_id: string;
  channel: string;
  target: string;
  created_at: string;
};

type ProviderStateRow = {
  provider_id: string;
  status: string;
  message: string | null;
  updated_at: string;
};

function mapProvider(row: ProviderRow): ProviderConfig {
  return {
    id: row.id,
    name: row.name,
    service: row.service,
    sourceLabel: row.source_label,
    sourceUrl: row.source_url,
    feedUrl: row.feed_url ?? undefined,
    incidentsUrl: row.incidents_url ?? undefined,
    accent: row.accent,
    monogram: row.monogram,
    manualOnly: row.manual_only === 1,
  };
}

function mapSnapshot(row: SnapshotRow): DbStatusSnapshot {
  return {
    id: row.id,
    providerId: row.provider_id,
    status: row.status as StatusKind,
    message: row.message ?? "",
    timestamp: row.timestamp ?? undefined,
    history: JSON.parse(row.history) as HistoryKind[],
    createdAt: row.created_at,
  };
}

function mapIncident(row: IncidentRow): DbIncident {
  return {
    id: row.id,
    providerId: row.provider_id,
    name: row.name,
    impact: row.impact,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at ?? undefined,
    updates: JSON.parse(row.updates),
  };
}

function mapSubscription(row: SubscriptionRow): DbSubscription {
  return {
    id: row.id,
    providerId: row.provider_id,
    channel: row.channel as "email" | "webhook",
    target: row.target,
    createdAt: row.created_at,
  };
}

function mapProviderState(row: ProviderStateRow): DbProviderState {
  return {
    providerId: row.provider_id,
    status: row.status,
    message: row.message ?? undefined,
    updatedAt: row.updated_at,
  };
}

export function createDb(db: D1Database) {
  return {
    // --- PROVIDERS ---
    async getProviders(): Promise<ProviderConfig[]> {
      const { results } = await db.prepare("SELECT * FROM providers").all<ProviderRow>();
      return results.map(mapProvider);
    },

    async getProvider(id: string): Promise<ProviderConfig | null> {
      const row = await db.prepare("SELECT * FROM providers WHERE id = ?").bind(id).first<ProviderRow>();
      return row ? mapProvider(row) : null;
    },

    async upsertProvider(p: ProviderConfig): Promise<void> {
      await db.prepare(`
        INSERT INTO providers (id, name, service, source_label, source_url, feed_url, incidents_url, accent, monogram, manual_only)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          service = excluded.service,
          source_label = excluded.source_label,
          source_url = excluded.source_url,
          feed_url = excluded.feed_url,
          incidents_url = excluded.incidents_url,
          accent = excluded.accent,
          monogram = excluded.monogram,
          manual_only = excluded.manual_only
      `).bind(
        p.id, p.name, p.service, p.sourceLabel, p.sourceUrl, p.feedUrl ?? null, p.incidentsUrl ?? null, p.accent, p.monogram, p.manualOnly ? 1 : 0
      ).run();
    },

    // --- STATUS ---
    async saveStatusSnapshot(providerId: string, snap: Omit<DbStatusSnapshot, "id" | "createdAt">): Promise<void> {
      await db.prepare(`
        INSERT INTO status_snapshots (provider_id, status, message, timestamp, history)
        VALUES (?, ?, ?, ?, ?)
      `).bind(
        providerId, snap.status, snap.message, snap.timestamp ?? null, JSON.stringify(snap.history)
      ).run();
    },

    async getStatusHistory(providerId: string, limit: number = 50): Promise<DbStatusSnapshot[]> {
      const { results } = await db.prepare(`
        SELECT * FROM status_snapshots 
        WHERE provider_id = ? 
        ORDER BY created_at DESC LIMIT ?
      `).bind(providerId, limit).all<SnapshotRow>();
      return results.map(mapSnapshot);
    },

    async getLatestStatus(providerId: string): Promise<DbStatusSnapshot | null> {
      const row = await db.prepare(`
        SELECT * FROM status_snapshots 
        WHERE provider_id = ? 
        ORDER BY created_at DESC LIMIT 1
      `).bind(providerId).first<SnapshotRow>();
      return row ? mapSnapshot(row) : null;
    },

    // --- INCIDENTS ---
    async getIncidents(providerId?: string): Promise<DbIncident[]> {
      let results;
      if (providerId) {
        results = (await db.prepare("SELECT * FROM incidents WHERE provider_id = ? ORDER BY created_at DESC").bind(providerId).all<IncidentRow>()).results;
      } else {
        results = (await db.prepare("SELECT * FROM incidents ORDER BY created_at DESC").all<IncidentRow>()).results;
      }
      return results.map(mapIncident);
    },

    async getIncident(id: string): Promise<DbIncident | null> {
      const row = await db.prepare("SELECT * FROM incidents WHERE id = ?").bind(id).first<IncidentRow>();
      return row ? mapIncident(row) : null;
    },

    async upsertIncident(incident: DbIncident): Promise<void> {
      await db.prepare(`
        INSERT INTO incidents (id, provider_id, name, impact, status, created_at, updated_at, resolved_at, updates)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          impact = excluded.impact,
          status = excluded.status,
          updated_at = excluded.updated_at,
          resolved_at = excluded.resolved_at,
          updates = excluded.updates
      `).bind(
        incident.id, incident.providerId, incident.name, incident.impact, incident.status, incident.createdAt, incident.updatedAt, incident.resolvedAt ?? null, JSON.stringify(incident.updates)
      ).run();
    },

    // --- SUBSCRIPTIONS ---
    async getSubscriptions(providerId?: string): Promise<DbSubscription[]> {
      let results;
      if (providerId) {
        results = (await db.prepare("SELECT * FROM subscriptions WHERE provider_id = ? ORDER BY created_at DESC").bind(providerId).all<SubscriptionRow>()).results;
      } else {
        results = (await db.prepare("SELECT * FROM subscriptions ORDER BY created_at DESC").all<SubscriptionRow>()).results;
      }
      return results.map(mapSubscription);
    },

    async getSubscription(id: string): Promise<DbSubscription | null> {
      const row = await db.prepare("SELECT * FROM subscriptions WHERE id = ?").bind(id).first<SubscriptionRow>();
      return row ? mapSubscription(row) : null;
    },

    async createSubscription(sub: DbSubscription): Promise<void> {
      await db.prepare(`
        INSERT INTO subscriptions (id, provider_id, channel, target, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).bind(sub.id, sub.providerId, sub.channel, sub.target, sub.createdAt).run();
    },

    async deleteSubscription(id: string): Promise<boolean> {
      const result = await db.prepare("DELETE FROM subscriptions WHERE id = ?").bind(id).run();
      return result.meta.changes > 0;
    },

    // --- PROVIDER STATE ---
    async getProviderState(providerId: string): Promise<DbProviderState | null> {
      const row = await db.prepare("SELECT * FROM provider_state WHERE provider_id = ?").bind(providerId).first<ProviderStateRow>();
      return row ? mapProviderState(row) : null;
    },

    async upsertProviderState(state: Omit<DbProviderState, "updatedAt">): Promise<void> {
      await db.prepare(`
        INSERT INTO provider_state (provider_id, status, message)
        VALUES (?, ?, ?)
        ON CONFLICT(provider_id) DO UPDATE SET
          status = excluded.status,
          message = excluded.message,
          updated_at = CURRENT_TIMESTAMP
      `).bind(state.providerId, state.status, state.message ?? null).run();
    },

    async compareAndSetProviderState(state: Omit<DbProviderState, "updatedAt">, previousStatus: string | null): Promise<boolean> {
      if (previousStatus === null) {
        const result = await db.prepare(`
          INSERT OR IGNORE INTO provider_state (provider_id, status, message)
          VALUES (?, ?, ?)
        `).bind(state.providerId, state.status, state.message ?? null).run();
        return result.meta.changes > 0;
      } else {
        const result = await db.prepare(`
          UPDATE provider_state 
          SET status = ?, message = ?, updated_at = CURRENT_TIMESTAMP
          WHERE provider_id = ? AND status = ?
        `).bind(state.status, state.message ?? null, state.providerId, previousStatus).run();
        return result.meta.changes > 0;
      }
    }
  };
}
