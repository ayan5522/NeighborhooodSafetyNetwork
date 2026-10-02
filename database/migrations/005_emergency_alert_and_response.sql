-- Module 04: Emergency Alert & Response Migration
-- Database: neighborhood_safety_db
-- User: nsn_app_user

-- 1. Alerts Table
CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    priority VARCHAR(20) NOT NULL CONSTRAINT chk_alerts_priority CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CONSTRAINT chk_alerts_status CHECK (status IN ('ACTIVE', 'RESOLVED', 'EXPIRED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    read_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uq_alerts_incident_recipient UNIQUE (incident_id, recipient_user_id)
);

CREATE INDEX IF NOT EXISTS idx_alerts_recipient_status ON alerts (recipient_user_id, status);
CREATE INDEX IF NOT EXISTS idx_alerts_incident_id ON alerts (incident_id);
CREATE INDEX IF NOT EXISTS idx_alerts_expires_at ON alerts (expires_at);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_recipient_created ON alerts (recipient_user_id, created_at DESC);

-- 2. Emergency Contacts Table
CREATE TABLE IF NOT EXISTS emergency_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contact_name VARCHAR(255) NOT NULL,
    phone_number VARCHAR(50) NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_emergency_contacts_user_id ON emergency_contacts (user_id);
CREATE INDEX IF NOT EXISTS idx_emergency_contacts_user_primary ON emergency_contacts (user_id, is_primary);

-- 3. SOS Events Table
CREATE TABLE IF NOT EXISTS sos_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    location GEOGRAPHY(Point, 4326) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CONSTRAINT chk_sos_status CHECK (status IN ('ACTIVE', 'RESOLVED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    resolved_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT chk_sos_latitude CHECK (latitude >= -90.0 AND latitude <= 90.0),
    CONSTRAINT chk_sos_longitude CHECK (longitude >= -180.0 AND longitude <= 180.0)
);

CREATE INDEX IF NOT EXISTS idx_sos_events_user_status ON sos_events (user_id, status);
CREATE INDEX IF NOT EXISTS idx_sos_events_created_at ON sos_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sos_events_location_gist ON sos_events USING GIST (location);
