CREATE DATABASE IF NOT EXISTS user_behavior;

USE user_behavior;

CREATE TABLE IF NOT EXISTS user_events (
    event_id String,
    user_id String,
    session_id String,
    event_type String,
    page_url String,
    referrer String,
    user_agent String,
    ip_address String,
    country String,
    city String,
    device_type String,
    browser String,
    os String,
    event_properties Map(String, String),
    timestamp DateTime('Asia/Shanghai')
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (user_id, timestamp)
TTL timestamp + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;

CREATE TABLE IF NOT EXISTS user_sessions (
    session_id String,
    user_id String,
    start_time DateTime('Asia/Shanghai'),
    end_time DateTime('Asia/Shanghai'),
    duration_seconds UInt32,
    page_views UInt32,
    events_count UInt32,
    entry_page String,
    exit_page String,
    referrer String,
    country String,
    city String,
    device_type String,
    browser String,
    os String
)
ENGINE = ReplacingMergeTree(end_time)
PARTITION BY toYYYYMM(start_time)
ORDER BY (session_id, start_time)
TTL start_time + INTERVAL 90 DAY;

CREATE TABLE IF NOT EXISTS user_profiles (
    user_id String,
    first_seen DateTime('Asia/Shanghai'),
    last_seen DateTime('Asia/Shanghai'),
    total_sessions UInt32,
    total_page_views UInt32,
    country String,
    city String,
    device_type String,
    browser String,
    os String,
    user_properties Map(String, String)
)
ENGINE = ReplacingMergeTree(last_seen)
ORDER BY user_id
TTL last_seen + INTERVAL 180 DAY;

CREATE TABLE IF NOT EXISTS funnel_steps (
    funnel_id String,
    funnel_name String,
    step_index UInt8,
    step_name String,
    event_type String,
    page_url String,
    created_at DateTime('Asia/Shanghai') DEFAULT now()
)
ENGINE = MergeTree()
ORDER BY (funnel_id, step_index);

CREATE MATERIALIZED VIEW IF NOT EXISTS hourly_stats_mv
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (hour, event_type, country)
AS SELECT
    toStartOfHour(timestamp) AS hour,
    event_type,
    country,
    count() AS events_count,
    uniqExact(user_id) AS unique_users,
    uniqExact(session_id) AS unique_sessions
FROM user_events
GROUP BY hour, event_type, country;

CREATE MATERIALIZED VIEW IF NOT EXISTS daily_stats_mv
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(day)
ORDER BY (day, event_type, country)
AS SELECT
    toStartOfDay(timestamp) AS day,
    event_type,
    country,
    count() AS events_count,
    uniqExact(user_id) AS unique_users,
    uniqExact(session_id) AS unique_sessions
FROM user_events
GROUP BY day, event_type, country;

CREATE TABLE IF NOT EXISTS retention_analysis (
    cohort_date Date,
    retention_day UInt8,
    user_count UInt32
)
ENGINE = ReplacingMergeTree()
ORDER BY (cohort_date, retention_day);

CREATE TABLE IF NOT EXISTS alert_rules (
    rule_id String,
    rule_name String,
    metric String,
    condition String,
    threshold Float64,
    window_minutes UInt32,
    enabled UInt8 DEFAULT 1,
    created_at DateTime('Asia/Shanghai') DEFAULT now(),
    updated_at DateTime('Asia/Shanghai') DEFAULT now()
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY rule_id;

CREATE TABLE IF NOT EXISTS alert_history (
    alert_id String,
    rule_id String,
    rule_name String,
    metric String,
    current_value Float64,
    threshold Float64,
    condition String,
    severity String,
    status String,
    triggered_at DateTime('Asia/Shanghai'),
    resolved_at DateTime('Asia/Shanghai') DEFAULT null,
    message String
)
ENGINE = MergeTree()
ORDER BY (triggered_at, alert_id)
TTL triggered_at + INTERVAL 90 DAY;

CREATE TABLE IF NOT EXISTS user_tags (
    user_id String,
    tag_name String,
    tag_value String,
    tag_category String,
    confidence Float64,
    first_detected DateTime('Asia/Shanghai'),
    last_updated DateTime('Asia/Shanghai')
)
ENGINE = ReplacingMergeTree(last_updated)
ORDER BY (user_id, tag_name)
TTL last_updated + INTERVAL 180 DAY;

CREATE TABLE IF NOT EXISTS tag_definitions (
    tag_name String,
    tag_category String,
    description String,
    conditions String,
    enabled UInt8 DEFAULT 1,
    created_at DateTime('Asia/Shanghai') DEFAULT now()
)
ENGINE = ReplacingMergeTree(created_at)
ORDER BY tag_name;
