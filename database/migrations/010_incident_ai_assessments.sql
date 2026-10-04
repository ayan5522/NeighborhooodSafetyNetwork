-- ============================================================
-- Migration 010: Incident AI Trust Assessments Table
-- Module 9: AI Trust & Reliability Engine
-- ============================================================

CREATE TABLE IF NOT EXISTS incident_ai_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    trust_score INTEGER CHECK (trust_score >= 0 AND trust_score <= 100),
    confidence_level VARCHAR(20) NOT NULL CHECK (confidence_level IN ('LOW', 'MEDIUM', 'HIGH', 'UNAVAILABLE')),
    trust_category VARCHAR(20) CHECK (trust_category IN ('LOW', 'MODERATE', 'HIGH', 'VERY_HIGH')),
    model_version VARCHAR(50) NOT NULL,
    feature_version VARCHAR(50) NOT NULL,
    explanation JSONB DEFAULT '[]'::jsonb,
    raw_probability NUMERIC(6, 4),
    features_snapshot JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for rapid lookups of incident AI reliability
CREATE INDEX IF NOT EXISTS idx_ai_assessments_incident_id ON incident_ai_assessments(incident_id);
CREATE INDEX IF NOT EXISTS idx_ai_assessments_created_at ON incident_ai_assessments(created_at DESC);
