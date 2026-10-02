-- Module 05: Community Verification Migration
-- Database: neighborhood_safety_db
-- User: nsn_app_user

CREATE TABLE IF NOT EXISTS incident_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    verification_type VARCHAR(20) NOT NULL CONSTRAINT chk_incident_verifications_type CHECK (verification_type IN ('CONFIRM', 'DISPUTE')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uq_incident_verifications_incident_user UNIQUE (incident_id, user_id)
);

-- Index on incident_id for rapid aggregation
CREATE INDEX IF NOT EXISTS idx_incident_verifications_incident_id ON incident_verifications (incident_id);

-- Index on user_id for user verification history
CREATE INDEX IF NOT EXISTS idx_incident_verifications_user_id ON incident_verifications (user_id);

-- Composite index for fast count filtering by type
CREATE INDEX IF NOT EXISTS idx_incident_verifications_incident_type ON incident_verifications (incident_id, verification_type);
