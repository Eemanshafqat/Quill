CREATE TABLE IF NOT EXISTS analytics_events (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    referrer TEXT,
    occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_analytics_post_id
ON analytics_events(post_id);

CREATE INDEX IF NOT EXISTS idx_analytics_occurred_at
ON analytics_events(occurred_at);
