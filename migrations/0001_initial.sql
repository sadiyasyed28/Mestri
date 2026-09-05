-- migrations/0001_initial.sql

-- Providers table
CREATE TABLE providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    service TEXT NOT NULL,
    source_label TEXT NOT NULL,
    source_url TEXT NOT NULL,
    feed_url TEXT,
    incidents_url TEXT,
    accent TEXT NOT NULL,
    monogram TEXT NOT NULL,
    manual_only INTEGER DEFAULT 0
);

-- Status Snapshots table
CREATE TABLE status_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT,
    timestamp TEXT,
    history TEXT NOT NULL, -- Stored as JSON array
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (provider_id) REFERENCES providers(id)
);
CREATE INDEX idx_status_snapshots_provider_id ON status_snapshots(provider_id);
CREATE INDEX idx_status_snapshots_created_at ON status_snapshots(created_at);

-- Incidents table
CREATE TABLE incidents (
    id TEXT PRIMARY KEY, -- The incident ID from the provider (e.g. statuspage id)
    provider_id TEXT NOT NULL,
    name TEXT NOT NULL,
    impact TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    resolved_at TEXT,
    updates TEXT NOT NULL, -- Stored as JSON array
    FOREIGN KEY (provider_id) REFERENCES providers(id)
);
CREATE INDEX idx_incidents_provider_id ON incidents(provider_id);
CREATE INDEX idx_incidents_status ON incidents(status);

-- Subscriptions table
CREATE TABLE subscriptions (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    channel TEXT NOT NULL, -- 'email' or 'webhook'
    target TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (provider_id) REFERENCES providers(id)
);
CREATE INDEX idx_subscriptions_provider_id ON subscriptions(provider_id);

-- Provider State table (for transition detection)
CREATE TABLE provider_state (
    provider_id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    message TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (provider_id) REFERENCES providers(id)
);
