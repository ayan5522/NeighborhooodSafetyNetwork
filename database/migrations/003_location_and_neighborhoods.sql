-- Module 02: Location & Neighborhood Management Migration
-- Database: neighborhood_safety_db
-- User: nsn_app_user

-- Create user_locations table for storing single latest usable location per user
CREATE TABLE IF NOT EXISTS user_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    location GEOGRAPHY(Point, 4326) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    accuracy DOUBLE PRECISION,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_user_locations_latitude CHECK (latitude >= -90.0 AND latitude <= 90.0),
    CONSTRAINT chk_user_locations_longitude CHECK (longitude >= -180.0 AND longitude <= 180.0)
);

-- Spatial index on PostGIS geography column
CREATE INDEX IF NOT EXISTS idx_user_locations_location_gist ON user_locations USING GIST (location);

-- Index on user_id for fast lookup
CREATE INDEX IF NOT EXISTS idx_user_locations_user_id ON user_locations(user_id);

-- Optional neighborhoods reference table foundation
CREATE TABLE IF NOT EXISTS neighborhoods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL UNIQUE,
    boundary GEOGRAPHY(Polygon, 4326),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_neighborhoods_boundary_gist ON neighborhoods USING GIST (boundary);
