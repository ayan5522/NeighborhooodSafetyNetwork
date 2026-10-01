-- Module 03: Incident Reporting Migration
-- Database: neighborhood_safety_db
-- User: nsn_app_user

CREATE TABLE IF NOT EXISTS incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    category VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    severity VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    location GEOGRAPHY(Point, 4326) NOT NULL,
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_incidents_category CHECK (
        category IN (
            'ACCIDENT',
            'FIRE',
            'SUSPICIOUS_ACTIVITY',
            'ROAD_HAZARD',
            'FLOOD_WATERLOGGING',
            'MEDICAL_EMERGENCY',
            'INFRASTRUCTURE_ISSUE',
            'OTHER'
        )
    ),
    CONSTRAINT chk_incidents_severity CHECK (
        severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')
    ),
    CONSTRAINT chk_incidents_status CHECK (
        status IN ('PENDING', 'ACTIVE', 'RESOLVED', 'CANCELLED')
    ),
    CONSTRAINT chk_incidents_latitude CHECK (latitude >= -90.0 AND latitude <= 90.0),
    CONSTRAINT chk_incidents_longitude CHECK (longitude >= -180.0 AND longitude <= 180.0)
);

-- Spatial index on PostGIS geography column
CREATE INDEX IF NOT EXISTS idx_incidents_location_gist ON incidents USING GIST (location);

-- Index on reporter_id for fast query by author
CREATE INDEX IF NOT EXISTS idx_incidents_reporter_id ON incidents (reporter_id);

-- Index on status
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents (status);

-- Index on created_at for reverse chronological ordering
CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON incidents (created_at DESC);

-- Index on category
CREATE INDEX IF NOT EXISTS idx_incidents_category ON incidents (category);
