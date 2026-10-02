-- Module 06: Real-Time Communication & Notifications Migration
-- Database: neighborhood_safety_db
-- User: nsn_app_user

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CONSTRAINT chk_notifications_type CHECK (
        type IN (
            'INCIDENT_NEARBY',
            'ALERT_CREATED',
            'ALERT_UPDATED',
            'ALERT_RESOLVED',
            'SOS_NOTIFICATION',
            'COMMUNITY_VERIFICATION',
            'SYSTEM'
        )
    ),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    incident_id UUID REFERENCES incidents(id) ON DELETE SET NULL,
    alert_id UUID REFERENCES alerts(id) ON DELETE SET NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    read_at TIMESTAMP WITH TIME ZONE
);

-- Index for fetching user notifications ordered by newest first
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications (user_id, created_at DESC);

-- Composite index for user unread count and unread filtering
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread_created ON notifications (user_id, is_read, created_at DESC);

-- Foreign key lookup indexes
CREATE INDEX IF NOT EXISTS idx_notifications_incident_id ON notifications (incident_id);
CREATE INDEX IF NOT EXISTS idx_notifications_alert_id ON notifications (alert_id);

-- Partial unique index to prevent duplicate alert notifications for the same user and alert event
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_user_alert_type ON notifications (user_id, alert_id, type) WHERE alert_id IS NOT NULL;
