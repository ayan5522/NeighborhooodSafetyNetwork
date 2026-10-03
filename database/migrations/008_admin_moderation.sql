-- Module 07: Admin & Moderation Migration
-- Database: neighborhood_safety_db
-- User: nsn_app_user

-- Create incident_reports table for community flagging and moderation
CREATE TABLE IF NOT EXISTS incident_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    reporter_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason VARCHAR(50) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT chk_incident_reports_reason CHECK (
        reason IN (
            'FALSE_INFORMATION',
            'SPAM',
            'DUPLICATE',
            'INAPPROPRIATE_CONTENT',
            'MISLEADING',
            'OTHER'
        )
    ),
    CONSTRAINT chk_incident_reports_status CHECK (
        status IN (
            'PENDING',
            'REVIEWED',
            'DISMISSED',
            'ACTION_TAKEN'
        )
    ),
    -- Baseline protection: One report per user per incident
    CONSTRAINT uq_incident_reports_incident_user UNIQUE (incident_id, reporter_user_id)
);

-- Indexes for efficient moderation queue querying and filtering
CREATE INDEX IF NOT EXISTS idx_incident_reports_incident_id ON incident_reports(incident_id);
CREATE INDEX IF NOT EXISTS idx_incident_reports_reporter_user_id ON incident_reports(reporter_user_id);
CREATE INDEX IF NOT EXISTS idx_incident_reports_status_created_at ON incident_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incident_reports_reviewed_by ON incident_reports(reviewed_by);
