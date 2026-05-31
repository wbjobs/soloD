CREATE DATABASE radio_archive;

\c radio_archive;

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

CREATE TABLE observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_hash VARCHAR(64) UNIQUE NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,
    observation_time TIMESTAMPTZ NOT NULL,
    frequency_start DOUBLE PRECISION NOT NULL,
    frequency_end DOUBLE PRECISION NOT NULL,
    coordinate GEOMETRY(Point, 4326) NOT NULL,
    storage_path VARCHAR(512) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_observations_coordinate ON observations USING GIST(coordinate);
CREATE INDEX idx_observations_file_hash ON observations(file_hash);
CREATE INDEX idx_observations_time ON observations(observation_time);

CREATE TABLE upload_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_name VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,
    total_chunks INTEGER NOT NULL,
    received_chunks INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_upload_sessions_expires ON upload_sessions(expires_at);
