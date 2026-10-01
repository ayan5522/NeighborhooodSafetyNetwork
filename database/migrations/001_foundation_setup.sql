-- Module 00: Foundation Setup Migration
-- Database: neighborhood_safety_db
-- User: nsn_app_user

-- Ensure PostGIS is enabled
CREATE EXTENSION IF NOT EXISTS postgis;

-- Schema migrations tracker
CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- System health & status tracker
CREATE TABLE IF NOT EXISTS system_status (
    id SERIAL PRIMARY KEY,
    component VARCHAR(100) NOT NULL UNIQUE,
    status VARCHAR(50) NOT NULL DEFAULT 'OPERATIONAL',
    details JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert baseline status
INSERT INTO system_status (component, status, details)
VALUES (
    'foundation',
    'OPERATIONAL',
    jsonb_build_object(
        'project', 'NeighborhoodSafetyNetwork',
        'db_user', 'nsn_app_user',
        'postgis_enabled', true,
        'initialized_at', CURRENT_TIMESTAMP
    )
)
ON CONFLICT (component) DO UPDATE
SET status = EXCLUDED.status,
    details = EXCLUDED.details,
    updated_at = CURRENT_TIMESTAMP;
